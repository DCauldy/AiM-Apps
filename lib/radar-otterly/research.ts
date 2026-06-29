import "server-only";

import { generateObject } from "ai";
import { z } from "zod";

import { getRadarAnalyzerModel } from "@/lib/openrouter";
import { createOtterlyClient } from "./client";
import { listWorkspaces, createContentCheck } from "./accessors";
import type { OtterlyAuditCheck } from "./types";

// ============================================================
// Auto-research for first-run Radar setup.
//
// Given a hostname + the customer's platform profile, returns a
// merged list of suggested competitors from two sources so ops
// doesn't have to guess when provisioning the brand report:
//
//   1. otterly_audit  — runs a content check on the hostname so
//                       AI engines respond about that URL, then
//                       extracts the brand names they mention.
//                       Reliable but slow (~5-10s).
//   2. llm_profile    — Claude/GPT-4o call grounded in the
//                       customer's profile (geography, niche,
//                       target clients). Pure inference; fast.
//
// Results never reach the customer — they're shown to ops in the
// admin queue so the human picks 3-5 competitors when wiring up
// the actual brand report.
// ============================================================

export type SuggestionSource = "otterly_audit" | "llm_profile";

export interface SuggestedCompetitor {
  name: string;
  domain: string | null;
  source: SuggestionSource;
  rationale: string;
}

export interface ResearchResult {
  competitors: SuggestedCompetitor[];
  prompts: string[];
  otterly_audit_id: string | null;
  errors: Array<{ source: string; message: string }>;
}

export interface ResearchProfile {
  display_name?: string | null;
  full_name?: string | null;
  professional_type?: string | null;
  brokerage?: string | null;
  metro_area?: string | null;
  state?: string | null;
  target_clients?: string[] | null;
  specializations?: string[] | null;
  property_types?: string[] | null;
}

const llmCompetitorSchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string().min(1),
        domain: z.string().nullable(),
        rationale: z.string().min(1),
      }),
    )
    .max(8),
});

const llmPromptsSchema = z.object({
  prompts: z.array(z.string().min(3).max(120)).min(5).max(8),
});

export async function researchCompetitors(args: {
  hostname: string;
  profile: ResearchProfile;
}): Promise<ResearchResult> {
  const errors: ResearchResult["errors"] = [];

  // All three sources run in parallel — independent failures shouldn't
  // sink the others. Ops can work the queue with partial results.
  const [auditResult, competitorsLlm, promptsLlm] = await Promise.allSettled([
    runOtterlyAudit(args.hostname),
    runLlmSuggestions(args.hostname, args.profile),
    runLlmPrompts(args.hostname, args.profile),
  ]);

  const competitors: SuggestedCompetitor[] = [];
  let otterly_audit_id: string | null = null;

  if (auditResult.status === "fulfilled") {
    competitors.push(...auditResult.value.competitors);
    otterly_audit_id = auditResult.value.audit_id;
    if (!auditResult.value.polled) {
      // Audit was created but didn't finish in our 10s budget — the
      // audit_id is still stored so ops can pull AI-mentioned brands
      // from Otterly's UI later.
      errors.push({
        source: "otterly_audit",
        message: `Audit ${auditResult.value.audit_id} still running — check Otterly later.`,
      });
    }
  } else {
    errors.push({
      source: "otterly_audit",
      message:
        auditResult.reason instanceof Error
          ? auditResult.reason.message
          : String(auditResult.reason),
    });
  }

  if (competitorsLlm.status === "fulfilled") {
    competitors.push(...competitorsLlm.value);
  } else {
    errors.push({
      source: "llm_profile",
      message:
        competitorsLlm.reason instanceof Error
          ? competitorsLlm.reason.message
          : String(competitorsLlm.reason),
    });
  }

  let prompts: string[] = [];
  if (promptsLlm.status === "fulfilled") {
    prompts = promptsLlm.value;
  } else {
    errors.push({
      source: "llm_prompts",
      message:
        promptsLlm.reason instanceof Error
          ? promptsLlm.reason.message
          : String(promptsLlm.reason),
    });
  }

  // De-dup by lowercased name. Otterly audit + LLM frequently
  // surface the same brand from different angles; keep the first
  // occurrence (Otterly audit takes priority since it's evidence
  // based) so ops sees one row per brand.
  const seen = new Set<string>();
  const deduped = competitors.filter((c) => {
    const key = c.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    competitors: deduped,
    prompts,
    otterly_audit_id,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Source 1 — Otterly content check
// ---------------------------------------------------------------------------

async function runOtterlyAudit(hostname: string): Promise<{
  competitors: SuggestedCompetitor[];
  audit_id: string;
  polled: boolean;
}> {
  const client = createOtterlyClient();

  // Audits are workspace-scoped. We use the first workspace this API
  // key can see — for our single-workspace trial setup that's "Your
  // First Workspace". Multi-workspace will land later if/when we move
  // to a partner API.
  const wsList = await listWorkspaces(client);
  const workspace = wsList.items[0];
  if (!workspace) {
    throw new Error("No Otterly workspace available for the configured API key.");
  }

  const url = hostname.startsWith("http") ? hostname : `https://${hostname}`;
  const check = await createContentCheck(
    {
      workspaceId: workspace.id,
      url,
    },
    client,
  );

  // Try to poll for completion within the 10s budget. If we time out,
  // return empty competitors but keep the audit_id so it's persisted
  // on the request row — ops can pull the AI-mentioned brands from
  // Otterly's UI later. Throwing here would lose the audit_id.
  let finished: OtterlyAuditCheck | null = null;
  try {
    finished = await pollAuditCheck(check.id, client.raw);
  } catch {
    return { competitors: [], audit_id: check.id, polled: false };
  }

  // Extract brand mentions from the finished check. Shape is:
  //   { detectedBrands: [{ name, mentions }], ... }
  const brands = (finished as unknown as {
    detectedBrands?: Array<{ name?: string; mentions?: number }>;
  }).detectedBrands ?? [];

  const competitors: SuggestedCompetitor[] = brands
    .filter((b) => b?.name)
    .map((b) => ({
      name: String(b.name),
      domain: null,
      source: "otterly_audit" as const,
      rationale: `AI engines mention this brand when answering questions about ${hostname} (${b.mentions ?? 0} mentions in the audit).`,
    }));

  return { competitors, audit_id: check.id, polled: true };
}

async function pollAuditCheck(
  id: string,
  raw: <T>(path: string, init?: RequestInit) => Promise<T>,
): Promise<OtterlyAuditCheck> {
  // 10s cap keeps the whole setup endpoint under Vercel's 30s
  // max-duration. Otterly audits typically take 30-60s; if it isn't
  // done by then the audit_id is still stored on the request row so
  // ops can check Otterly's UI later for the AI-mentioned brands.
  const deadline = Date.now() + 10_000;
  let delay = 1_500;
  while (Date.now() < deadline) {
    const c = await raw<OtterlyAuditCheck>(`/v1/audits/geo/content-checks/${id}`);
    if (c.status === "finished" || c.status === "failed") {
      if (c.status === "failed") {
        throw new Error(`Otterly content check ${id} reported status=failed.`);
      }
      return c;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.3, 4_000);
  }
  throw new Error(`Otterly content check ${id} did not finish within 25s.`);
}

// ---------------------------------------------------------------------------
// Source 2 — LLM suggestions from the customer's profile
// ---------------------------------------------------------------------------

async function runLlmSuggestions(
  hostname: string,
  profile: ResearchProfile,
): Promise<SuggestedCompetitor[]> {
  const profileSummary = describeProfile(profile);
  const prompt = `You are helping research competitors for an AI visibility tracking setup.

A real-estate professional has signed up to track how their brand appears in ChatGPT, Perplexity, Gemini, and other AI search engines. Before we configure their tracking, suggest 3-5 specific competing brands they should track.

THEIR PROFILE:
${profileSummary}

THEIR WEBSITE: ${hostname}

REQUIREMENTS:
- Suggest 3-5 actual, named competitor brands (real estate teams, brokerages, agents, or platforms) — not generic categories.
- Prioritize competitors in the same geography (${profile.metro_area ?? profile.state ?? "their stated region"}) and serving the same client type.
- If they're a solo agent, focus on top local teams. If they're a brokerage, focus on competing brokerages.
- For each, include a 1-sentence rationale explaining why it's relevant given their profile.
- Include a website domain only if you're confident; otherwise leave it null. NEVER invent a domain.

Return JSON matching the schema.`;

  const { object } = await generateObject({
    model: getRadarAnalyzerModel(),
    schema: llmCompetitorSchema,
    prompt,
    temperature: 0.3,
  });

  return object.competitors.map((c) => ({
    name: c.name,
    domain: c.domain,
    source: "llm_profile" as const,
    rationale: c.rationale,
  }));
}

// ---------------------------------------------------------------------------
// Source 3 — LLM-generated Otterly seed prompts
//
// Otterly's "AI Prompt Research" tool takes a short seed phrase and
// expands it into ~10 question variations scored for relevance. So we
// generate 5-8 SEED phrases (broader topic strings), not fully-formed
// queries — Otterly does the expansion. Ops paste these straight into
// Otterly's prompt-research tool to populate the workspace.
//
// Mix of intent types:
//   - Category seeds ("best X in Y geography") — the bread and butter
//   - Specialization seeds ("VA loan realtors in Y", "luxury home agents in Y")
//   - Brand-name seed (1, exact brand string)
// ---------------------------------------------------------------------------

async function runLlmPrompts(
  hostname: string,
  profile: ResearchProfile,
): Promise<string[]> {
  const profileSummary = describeProfile(profile);
  const brandName =
    profile.display_name?.trim() ||
    profile.full_name?.trim() ||
    hostname.split(".")[0];

  const prompt = `You are generating Otterly "seed prompts" for AI visibility tracking.

Otterly's AI Prompt Research tool takes a short seed phrase and automatically expands it into ~10 scored question variations. So we need short, topical SEEDS — not fully-formed questions.

Examples of good seeds:
  - "best real estate agents in Northern Kentucky"
  - "luxury home agents in Cincinnati"
  - "VA loan realtors in Cincinnati"

Examples of bad seeds (too narrow / question-shaped):
  - "Who are the best real estate agents in Northern Kentucky for VA buyers?"
  - "how do I find a Cincinnati realtor"

CUSTOMER PROFILE:
${profileSummary}

WEBSITE: ${hostname}
BRAND: ${brandName}

REQUIREMENTS:
- Generate 5-8 seed phrases. Mix:
  1. **Category seeds** (3-5): "best/top X in Y" or "X agents in Y" — Y is their geography (${profile.metro_area ?? profile.state ?? "their region"}), X reflects their target clients (${profile.target_clients?.join("/") ?? "buyers, sellers"}).
  2. **Specialization seeds** (1-3): one per major specialization they listed (e.g. luxury, VA loans, first-time buyers, new construction). Include geography.
  3. **Brand seed** (1): the brand name itself, exactly — "${brandName}". Otterly handles brand-mention tracking from this.
- Each seed: 4-10 words. Short, topical, lowercase.
- Avoid duplicates and near-duplicates.
- Geography wording: prefer how Otterly seems to expand it — e.g. "Northern Kentucky" or "Cincinnati Ohio" rather than "Northern KY".

Return the seeds as a flat array of strings.`;

  const { object } = await generateObject({
    model: getRadarAnalyzerModel(),
    schema: llmPromptsSchema,
    prompt,
    temperature: 0.5,
  });

  // Final-pass de-dup by lowercase trimmed match — the LLM can still
  // emit subtle duplicates ("best realtor in cincinnati" vs "best
  // realtors in cincinnati") despite the requirements.
  const seen = new Set<string>();
  return object.prompts.filter((p) => {
    const key = p.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function describeProfile(p: ResearchProfile): string {
  const lines: string[] = [];
  const name = p.display_name ?? p.full_name;
  if (name) lines.push(`Name: ${name}`);
  if (p.professional_type) lines.push(`Role: ${p.professional_type}`);
  if (p.brokerage) lines.push(`Brokerage: ${p.brokerage}`);
  const geo = [p.metro_area, p.state].filter(Boolean).join(", ");
  if (geo) lines.push(`Geography: ${geo}`);
  if (p.target_clients?.length)
    lines.push(`Target clients: ${p.target_clients.join(", ")}`);
  if (p.specializations?.length)
    lines.push(`Specializations: ${p.specializations.join(", ")}`);
  if (p.property_types?.length)
    lines.push(`Property types: ${p.property_types.join(", ")}`);
  return lines.length ? lines.join("\n") : "(no profile detail captured)";
}
