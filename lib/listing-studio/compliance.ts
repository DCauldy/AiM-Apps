import { generateText } from "ai";

import { getListingStudioComplianceModel } from "@/lib/openrouter";

// ============================================================
// Compliance — Layer 1 (system-prompt preamble) + Layer 2 (post-gen validator)
//
// Real estate has hard legal lines: Fair Housing (no discrimination on
// protected classes), RESPA (no kickback / lender-recommendation language),
// MLS rules (no agent contact info in Public Remarks in most markets).
//
// Strategy:
//   - COMPLIANCE_PREAMBLE is appended to every Claude prompt across Listing
//     Studio outputs (description, DOTW, HTML email). Prevention > detection.
//   - checkCompliance() runs a cheap Haiku-class pass after generation.
//     Flagged outputs are still saved, but with compliance_warning set so
//     the UI can surface a banner the agent must acknowledge.
// ============================================================

/**
 * Shared compliance preamble appended to every Listing Studio Claude prompt.
 * Reused by description, DOTW, and HTML email writers — single source of truth
 * so the legal floor moves in lockstep across every output type.
 */
export const COMPLIANCE_PREAMBLE = `## Compliance rules (HARD FLOOR — never violate)

You are writing real estate marketing copy in the United States. The following
restrictions are non-negotiable. If any draft you produce would violate them,
rewrite until it doesn't. When in doubt, omit the phrase entirely.

**Fair Housing (FHA) — protected-class language is forbidden.**
- No descriptors that imply preference for or against any group based on race,
  color, religion, sex, disability, familial status, or national origin.
- Forbidden phrases include but are not limited to: "family-friendly",
  "great for families", "good for kids", "perfect for empty-nesters",
  "quiet neighborhood", "safe neighborhood", "good schools", "exclusive
  community", "walking distance to [house of worship]", "ethnic", "integrated",
  "bachelor pad", "master bedroom" (use "primary bedroom"), "his and hers"
  closets.
- Describe the PROPERTY and its FEATURES, not the people who might live there
  or the people who already live nearby.

**No school quality ratings.**
- You MAY mention proximity to a named school district by name
  ("within the Northwood School District boundary") if the user has provided
  that fact.
- You MUST NOT rate or qualify the schools ("award-winning schools",
  "top-rated schools", "best schools in the area", "highly-regarded schools").
- Use neutral proximity language only.

**No demographic / neighborhood-character descriptors.**
- No "quiet", "safe", "up-and-coming", "established", "mature", "vibrant",
  "diverse", "exclusive", "prestigious", or similar coded characterizations
  of the surrounding area.
- Walkability and proximity to factual landmarks (parks, public transit,
  named shopping districts) are OK when stated as facts.

**No steering language.**
- Don't suggest the property is more or less appropriate for any particular
  type of buyer.

**No lender, financing, or RESPA-violating recommendations.**
- Do not name lenders, loan officers, title companies, inspectors, or
  contractors as a recommendation or preferred provider.
- Do not characterize financing options ("FHA-friendly", "easy to finance").

**No agent contact details in MLS Public Remarks.**
- The description goes into the MLS Public Remarks field. Most MLSs prohibit
  agent name, phone, email, website, brokerage name, or any call-to-action
  to contact the listing agent in this field. Omit all of them.
- Do not include "Call for showings", "Contact listing agent", URLs, phone
  numbers, or email addresses.

**Equal Housing.**
- If the output type is an email or other branded marketing piece (not the
  MLS Public Remarks field), include or preserve any Equal Housing Opportunity
  language the user's profile supplies. Do not strip it.

**Tone constraints (always):**
- No all-caps for emphasis.
- No exclamation points stacked or used for hype.
- No "actually", "literally", "stunning" (overused), "must-see" (low-info).
- Noun-dense, feature-rich, factual.`;

// ---------------------------------------------------------------------------
// Layer 2 — post-generation validator
// ---------------------------------------------------------------------------

export interface ComplianceCheckResult {
  passed: boolean;
  /** Human-readable summary of issues; null when passed. */
  warning: string | null;
  /** Exact phrases pulled from the content the validator flagged. */
  flagged_phrases: string[];
}

const VALIDATOR_SYSTEM = `You are a compliance reviewer for US real estate marketing copy. Your
job is to spot Fair Housing, RESPA, and MLS-rule violations in a draft and
return a strict JSON verdict. You do not rewrite — you only flag.

Return a JSON object with this exact shape:
{
  "passed": boolean,
  "warning": string | null,
  "flagged_phrases": string[]
}

- "passed" = true only if you find ZERO violations.
- "warning" = a one-sentence summary of what's wrong (null when passed).
- "flagged_phrases" = an array of the exact substrings from the content
  that triggered the flag. Empty array when passed.

Flag any of:
- Protected-class language (familial status, race, religion, disability,
  sex, national origin) — including coded terms like "family-friendly",
  "great for kids", "empty-nesters", "bachelor", "his and hers".
- School quality ratings ("award-winning schools", "top-rated", "best
  schools"). Proximity to a named district is OK.
- Neighborhood-character descriptors ("quiet", "safe", "exclusive",
  "prestigious", "up-and-coming", "diverse", "vibrant").
- Lender / financing recommendations, RESPA risk language.
- Agent contact info in a "description" (MLS Public Remarks) output —
  phone numbers, emails, URLs, "call listing agent", agent or brokerage
  names. (Other output types are exempt from this specific rule.)
- All-caps shouting, exclamation-point hype.

Return ONLY the JSON object. No prose, no markdown fences.`;

/**
 * Single Haiku-class compliance call. Fail-open: on model or parse error
 * we treat the output as passing so a flaky validator never blocks a
 * generation. Layer 1 (the prompt preamble) is the primary defense.
 */
export async function checkCompliance(
  content: string,
  outputType: string,
): Promise<ComplianceCheckResult> {
  if (!content || content.trim().length === 0) {
    return { passed: true, warning: null, flagged_phrases: [] };
  }

  try {
    const { text } = await generateText({
      model: getListingStudioComplianceModel(),
      system: VALIDATOR_SYSTEM,
      prompt: `Output type: ${outputType}\n\nContent to review:\n"""\n${content}\n"""`,
      temperature: 0,
    });

    // Tolerate the occasional ```json fence Claude wraps around structured output.
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { passed: true, warning: null, flagged_phrases: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ComplianceCheckResult>;
    const passed = parsed.passed === true;
    return {
      passed,
      warning: passed ? null : (parsed.warning ?? "Compliance review flagged this draft."),
      flagged_phrases: Array.isArray(parsed.flagged_phrases)
        ? parsed.flagged_phrases.filter((p): p is string => typeof p === "string")
        : [],
    };
  } catch (err) {
    // Fail-open. Layer 1 prompt guardrails are the primary defense; the
    // validator is belt-and-suspenders and should never block a save.
    console.warn("[listing-studio] compliance validator failed:", err);
    return { passed: true, warning: null, flagged_phrases: [] };
  }
}
