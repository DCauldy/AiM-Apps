import { generateText } from "ai";
import { NextRequest } from "next/server";

import { getFeatureFlag } from "@/lib/admin-config.server";
import { checkCompliance } from "@/lib/listing-studio/compliance";
import { getDescriptionPrompt } from "@/lib/listing-studio/prompts/description";
import { getListingStudioWriterModel } from "@/lib/openrouter";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  ListingOutputRow,
  ListingOutputStatus,
  ListingRow,
} from "@/types/listing-studio";

export const dynamic = "force-dynamic";

const OUTPUT_TYPE = "description" as const;
const DESCRIPTION_CHAR_LIMIT = 1000;

// ============================================================
// GET    /api/apps/listing-studio/listings/[id]/description
//   Return the existing description row if any (poll on page load).
//
// POST   /api/apps/listing-studio/listings/[id]/description
//   Generate (or regenerate) the description with Claude, run the Layer 2
//   compliance check, upsert into ls_outputs.
//
// PATCH  /api/apps/listing-studio/listings/[id]/description
//   Save hand-edits. Body: { content: string, status?: 'draft' | 'finalized' }.
//   Re-runs compliance against the edited content.
// ============================================================

async function loadOwnedListing(
  userId: string,
  listingId: string,
): Promise<ListingRow | null> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("ls_listings")
    .select("*")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ListingRow | null) ?? null;
}

/**
 * Select-then-update-or-insert. The unique index uses COALESCE(variant, '')
 * which Postgrest's onConflict can't target by column list — so we hand-roll
 * the upsert against the (listing_id, type, variant IS NULL) tuple.
 */
async function upsertDescriptionRow(
  listingId: string,
  fields: Partial<Pick<ListingOutputRow, "content" | "status" | "compliance_warning" | "pipeline_error">>,
): Promise<ListingOutputRow> {
  const service = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: existing } = await service
    .from("ls_outputs")
    .select("*")
    .eq("listing_id", listingId)
    .eq("type", OUTPUT_TYPE)
    .is("variant", null)
    .maybeSingle();

  if (existing) {
    const { data, error } = await service
      .from("ls_outputs")
      .update({
        ...fields,
        generated_at: nowIso,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ListingOutputRow;
  }

  const { data, error } = await service
    .from("ls_outputs")
    .insert({
      listing_id: listingId,
      type: OUTPUT_TYPE,
      variant: null,
      status: "draft",
      ...fields,
      generated_at: nowIso,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ListingOutputRow;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const listing = await loadOwnedListing(user.id, id);
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });

  const service = createServiceRoleClient();
  const { data } = await service
    .from("ls_outputs")
    .select("*")
    .eq("listing_id", id)
    .eq("type", OUTPUT_TYPE)
    .is("variant", null)
    .maybeSingle();

  return Response.json({ output: (data as ListingOutputRow | null) ?? null });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const listing = await loadOwnedListing(user.id, id);
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });

  // Description is an active-stage output. Workspace tabs are locked in the
  // UI, but a direct API hit could bypass that — re-check here.
  if (listing.stage !== "active") {
    return Response.json(
      { error: "Description is only available on active-stage listings." },
      { status: 400 },
    );
  }

  const prompt = getDescriptionPrompt({
    facts: listing.property_facts ?? {},
    charLimit: DESCRIPTION_CHAR_LIMIT,
  });

  let content = "";
  try {
    const result = await generateText({
      model: getListingStudioWriterModel(),
      prompt,
      temperature: 0.7,
    });
    content = result.text.trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    // Persist the error onto the row so the UI can surface it + offer retry.
    try {
      const row = await upsertDescriptionRow(id, {
        pipeline_error: `Generation failed: ${message}`,
      });
      return Response.json({ output: row, error: message }, { status: 500 });
    } catch {
      return Response.json({ error: message }, { status: 500 });
    }
  }

  // Layer 2 compliance pass. Fail-open inside checkCompliance() — never
  // blocks save.
  const compliance = await checkCompliance(content, OUTPUT_TYPE);
  const warning = compliance.passed
    ? null
    : formatComplianceWarning(compliance.warning, compliance.flagged_phrases);

  const row = await upsertDescriptionRow(id, {
    content,
    status: "draft",
    compliance_warning: warning,
    pipeline_error: null,
  });

  return Response.json({ output: row });
}

const ALLOWED_STATUS = new Set<ListingOutputStatus>(["draft", "finalized"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const listing = await loadOwnedListing(user.id, id);
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });
  if (listing.stage !== "active") {
    return Response.json(
      { error: "Description is only available on active-stage listings." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content : null;
  if (content === null) {
    return Response.json({ error: "content (string) is required" }, { status: 400 });
  }

  const status: ListingOutputStatus | undefined =
    typeof body.status === "string" && ALLOWED_STATUS.has(body.status as ListingOutputStatus)
      ? (body.status as ListingOutputStatus)
      : undefined;

  // Hand-edits get re-validated so the warning state stays in sync with
  // what's actually saved.
  const compliance = await checkCompliance(content, OUTPUT_TYPE);
  const warning = compliance.passed
    ? null
    : formatComplianceWarning(compliance.warning, compliance.flagged_phrases);

  const row = await upsertDescriptionRow(id, {
    content,
    compliance_warning: warning,
    pipeline_error: null,
    ...(status ? { status } : {}),
  });

  return Response.json({ output: row });
}

function formatComplianceWarning(
  summary: string | null,
  phrases: string[],
): string {
  const head = summary?.trim() || "Compliance review flagged this draft.";
  if (phrases.length === 0) return head;
  const list = phrases.map((p) => `"${p}"`).join(", ");
  return `${head} Flagged: ${list}`;
}
