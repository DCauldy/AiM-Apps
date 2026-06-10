import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { getListingStudioWriterModel } from "@/lib/openrouter";
import { getProfileForListingStudio } from "@/lib/profiles/effective-profile";
import { getHtmlEmailCopyPrompt } from "@/lib/listing-studio/emails/html-prompts";
import {
  renderJustListedHtml,
  type HtmlEmailVariant,
  type CmaSummary,
} from "@/lib/listing-studio/emails/html-render";
import { checkCompliance } from "@/lib/listing-studio/compliance";
import { generateText } from "ai";
import { NextRequest } from "next/server";
import type {
  ListingRow,
  ListingOutputRow,
  CmaRunRow,
  PropertyFacts,
} from "@/types/listing-studio";

export const dynamic = "force-dynamic";

// ============================================================
// /api/apps/listing-studio/listings/[id]/html-email
//
// POST   { variant } → generate copy → render HTML → compliance → upsert.
// GET    Return existing rows by variant.
// PATCH  { variant, content, status? } → save user-edited HTML.
//
// Pricing variant requires a CMA on the listing. 400 if missing — UI hides
// the option in that state, but we double-check server-side.
// ============================================================

const VARIANTS: HtmlEmailVariant[] = ["announcement", "pricing"];

function isVariant(v: unknown): v is HtmlEmailVariant {
  return v === "announcement" || v === "pricing";
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: listing } = await supabase
    .from("ls_listings")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });

  const service = createServiceRoleClient();
  const { data: rows } = await service
    .from("ls_outputs")
    .select("*")
    .eq("listing_id", id)
    .eq("type", "html_email")
    .order("generated_at", { ascending: false });

  // Keep only the most recent row per variant (defensive — the unique index
  // already enforces 1 row per (listing,type,variant)).
  const seen = new Set<string>();
  const variants: ListingOutputRow[] = [];
  for (const r of (rows ?? []) as ListingOutputRow[]) {
    const key = r.variant ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(r);
  }

  // Tell the UI whether the pricing variant is unlocked, so it can gray out
  // the radio when no CMA exists yet.
  const { count: cmaCount } = await service
    .from("ls_cma_runs")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", id);

  return Response.json({
    variants,
    cmaAvailable: (cmaCount ?? 0) > 0,
  });
}

// ---------------------------------------------------------------------------
// POST — generate one variant
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const variant = body?.variant;
  if (!isVariant(variant)) {
    return Response.json(
      { error: `variant must be one of: ${VARIANTS.join(", ")}` },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const { data: listing } = await service
    .from("ls_listings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });

  const typedListing = listing as ListingRow;
  if (typedListing.stage !== "active") {
    return Response.json(
      { error: "Promote this listing to active before generating emails." },
      { status: 400 },
    );
  }

  const agentProfile = await getProfileForListingStudio(user.id);
  if (!agentProfile) {
    return Response.json(
      { error: "Active profile not found. Set up your profile under /apps/profile." },
      { status: 400 },
    );
  }

  let cmaSummary: CmaSummary | undefined;
  if (variant === "pricing") {
    const { data: cma } = await service
      .from("ls_cma_runs")
      .select("*")
      .eq("listing_id", id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cma) {
      return Response.json(
        {
          error:
            "Generate a CMA first to use the With-Pricing-Context variant.",
          code: "cma_required",
        },
        { status: 400 },
      );
    }
    cmaSummary = summarizeCma(cma as CmaRunRow, typedListing.property_facts) ?? undefined;
    if (!cmaSummary) {
      return Response.json(
        {
          error:
            "The existing CMA is missing a recommended price. Re-run the CMA before using this variant.",
          code: "cma_incomplete",
        },
        { status: 400 },
      );
    }
  }

  const now = new Date().toISOString();
  let html: string | null = null;
  let compliance_warning: string | null = null;
  let pipeline_error: string | null = null;

  try {
    const prompt = getHtmlEmailCopyPrompt({
      facts: typedListing.property_facts,
      listingAddress: typedListing.address,
      agentProfile,
      variant,
      cmaSummary,
      agentNotes: typedListing.notes,
    });

    const { text } = await generateText({
      model: getListingStudioWriterModel(),
      prompt,
      temperature: 0.7,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model did not return JSON");
    const parsed = JSON.parse(jsonMatch[0]) as {
      subject?: unknown;
      headline?: unknown;
      body?: unknown;
      cta_label?: unknown;
    };
    if (
      typeof parsed.subject !== "string" ||
      typeof parsed.headline !== "string" ||
      typeof parsed.body !== "string"
    ) {
      throw new Error("Generated copy payload missing required fields");
    }

    html = renderJustListedHtml({
      facts: typedListing.property_facts,
      listingAddress: typedListing.address,
      agentProfile,
      variant,
      copy: {
        subject: parsed.subject.trim(),
        headline: parsed.headline.trim(),
        body: parsed.body.trim(),
        cta_label:
          typeof parsed.cta_label === "string" && parsed.cta_label.trim()
            ? parsed.cta_label.trim()
            : "View listing details",
      },
      cmaSummary,
    });

    // Run compliance over the visible text portions, not the inline-styled HTML.
    const visible = [parsed.subject, parsed.headline, parsed.body]
      .filter((s): s is string => typeof s === "string")
      .join("\n\n");
    const check = await checkCompliance(visible, "html_email");
    if (!check.passed) compliance_warning = check.warning;
  } catch (err) {
    pipeline_error =
      err instanceof Error ? err.message : "Unknown generation error";
  }

  const { data, error } = await service
    .from("ls_outputs")
    .upsert(
      {
        listing_id: id,
        type: "html_email",
        variant,
        content: html,
        status: "draft",
        compliance_warning,
        pipeline_error,
        generated_at: now,
      },
      { onConflict: "listing_id,type,variant" },
    )
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ output: data as ListingOutputRow });
}

// ---------------------------------------------------------------------------
// PATCH — save user-edited HTML
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!isVariant(body?.variant)) {
    return Response.json(
      { error: `variant must be one of: ${VARIANTS.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof body.content !== "string") {
    return Response.json({ error: "content must be a string" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: listing } = await service
    .from("ls_listings")
    .select("id, user_id, stage")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });
  if ((listing as ListingRow).stage !== "active") {
    return Response.json(
      { error: "Promote the listing before editing email outputs." },
      { status: 400 },
    );
  }

  // Strip tags + run a compliance scan over the visible text only — checking
  // the raw HTML would surface false positives on attribute names like "color".
  const visible = body.content
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const check = await checkCompliance(visible, "html_email");

  const status =
    body.status === "finalized" || body.status === "draft"
      ? body.status
      : "draft";

  const { data: existing } = await service
    .from("ls_outputs")
    .select("generated_at")
    .eq("listing_id", id)
    .eq("type", "html_email")
    .eq("variant", body.variant)
    .maybeSingle();

  const { data, error } = await service
    .from("ls_outputs")
    .upsert(
      {
        listing_id: id,
        type: "html_email",
        variant: body.variant,
        content: body.content,
        status,
        compliance_warning: check.passed ? null : check.warning,
        pipeline_error: null,
        generated_at: existing?.generated_at ?? new Date().toISOString(),
      },
      { onConflict: "listing_id,type,variant" },
    )
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ output: data as ListingOutputRow });
}

// ---------------------------------------------------------------------------
// CMA summarization — squashes the CMA run down to the pricing block inputs.
// ---------------------------------------------------------------------------

function summarizeCma(cma: CmaRunRow, facts: PropertyFacts): CmaSummary | null {
  if (!cma.recommended_price_cents) return null;

  const compCount = cma.comps?.length ?? 0;
  const recommended = cma.recommended_price_cents;

  // Comp positioning: how the recommendation sits inside the pool. We compute
  // "priced below N of M comps" — straightforward and defensible.
  let belowCount = 0;
  for (const c of cma.comps ?? []) {
    if (
      typeof c.adjusted_value_cents === "number" &&
      c.adjusted_value_cents > recommended
    ) {
      belowCount++;
    }
  }
  const neighborhood = facts.city || facts.zip || "the area";
  const compPositioning =
    compCount > 0
      ? `Recommended price sits below ${belowCount} of ${compCount} recent comps in ${neighborhood}.`
      : `Recommended price reflects current market positioning in ${neighborhood}.`;

  // Market trend line: derive from the grid summary when present. Conservative
  // fallback when we don't have a YoY number.
  const grid = cma.adjustment_grid;
  let marketTrendLine = `Comparable sales in ${neighborhood} support this range.`;
  if (grid?.criteria?.months_back) {
    marketTrendLine = `Based on ${compCount || "recent"} comparable sales in the last ${grid.criteria.months_back} months.`;
  }

  return {
    recommendedPriceCents: recommended,
    compPositioning,
    marketTrendLine,
  };
}
