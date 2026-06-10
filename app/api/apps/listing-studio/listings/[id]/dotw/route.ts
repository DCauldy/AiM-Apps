import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { getListingStudioWriterModel } from "@/lib/openrouter";
import { getProfileForListingStudio } from "@/lib/profiles/effective-profile";
import { getDotwPrompt, type DotwVariant } from "@/lib/listing-studio/emails/dotw-prompts";
import { checkCompliance } from "@/lib/listing-studio/compliance";
import { generateText } from "ai";
import { NextRequest } from "next/server";
import type { ListingRow, ListingOutputRow } from "@/types/listing-studio";

export const dynamic = "force-dynamic";

// ============================================================
// /api/apps/listing-studio/listings/[id]/dotw
//
// POST   Generate BOTH variants in parallel, upsert two ls_outputs rows.
// GET    Return both variants if present.
// PATCH  Save user edits to one variant.
//
// Gated on stage='active' AND LISTING_STUDIO feature flag.
// ============================================================

interface DotwVariantPayload {
  variant: DotwVariant;
  subject: string;
  preheader: string;
  body: string;
  status: "draft" | "finalized";
  compliance_warning: string | null;
  pipeline_error: string | null;
  generated_at: string;
}

/** Serialized shape we persist into ls_outputs.content. */
function packContent(v: { subject: string; preheader: string; body: string }): string {
  return JSON.stringify(v);
}

function unpackContent(content: string | null): { subject: string; preheader: string; body: string } | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed?.subject === "string" && typeof parsed?.body === "string") {
      return {
        subject: parsed.subject,
        preheader: typeof parsed.preheader === "string" ? parsed.preheader : "",
        body: parsed.body,
      };
    }
  } catch {
    // Legacy or hand-edited content that isn't JSON — surface the raw body so
    // the UI can show it and the user can re-save it as structured.
    return { subject: "", preheader: "", body: content };
  }
  return null;
}

function rowToVariant(row: ListingOutputRow): DotwVariantPayload | null {
  if (row.variant !== "a" && row.variant !== "b") return null;
  const parts = unpackContent(row.content);
  if (!parts) return null;
  return {
    variant: row.variant,
    subject: parts.subject,
    preheader: parts.preheader,
    body: parts.body,
    status: row.status,
    compliance_warning: row.compliance_warning,
    pipeline_error: row.pipeline_error,
    generated_at: row.generated_at,
  };
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
    .select("id, user_id, stage")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });

  const service = createServiceRoleClient();
  const { data: rows } = await service
    .from("ls_outputs")
    .select("*")
    .eq("listing_id", id)
    .eq("type", "dotw_email");

  const variants = (rows ?? [])
    .map((r) => rowToVariant(r as ListingOutputRow))
    .filter((v): v is DotwVariantPayload => v !== null);

  return Response.json({ variants });
}

// ---------------------------------------------------------------------------
// POST — generate both variants in parallel
// ---------------------------------------------------------------------------

export async function POST(
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

  const service = createServiceRoleClient();
  const { data: listing } = await service
    .from("ls_listings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }
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

  // Generate both variants in parallel — independent Claude calls.
  const variants: DotwVariant[] = ["a", "b"];
  const results = await Promise.allSettled(
    variants.map((variant) =>
      generateOneVariant({
        listing: typedListing,
        agentProfile,
        variant,
      }),
    ),
  );

  // Upsert each result individually so a single-variant failure doesn't lose
  // the successful one. We persist a pipeline_error on the failing variant
  // row so the UI can show a retry banner per variant.
  const persistResults = await Promise.all(
    results.map(async (settled, idx) => {
      const variant = variants[idx];
      const now = new Date().toISOString();
      let content: string | null = null;
      let compliance_warning: string | null = null;
      let pipeline_error: string | null = null;

      if (settled.status === "fulfilled") {
        content = packContent(settled.value);
        const check = await checkCompliance(
          [settled.value.subject, settled.value.preheader, settled.value.body].join("\n\n"),
          "dotw_email",
        );
        if (!check.passed) compliance_warning = check.warning;
      } else {
        pipeline_error =
          settled.reason instanceof Error
            ? settled.reason.message
            : "Unknown generation error";
      }

      const { data, error } = await service
        .from("ls_outputs")
        .upsert(
          {
            listing_id: id,
            type: "dotw_email",
            variant,
            content,
            status: "draft",
            compliance_warning,
            pipeline_error,
            generated_at: now,
          },
          { onConflict: "listing_id,type,variant" },
        )
        .select()
        .single();
      if (error) {
        return { variant, error: error.message };
      }
      return { variant, row: data as ListingOutputRow };
    }),
  );

  const finalVariants: DotwVariantPayload[] = [];
  for (const r of persistResults) {
    if ("row" in r && r.row) {
      const v = rowToVariant(r.row);
      if (v) {
        finalVariants.push(v);
      } else if (r.row.pipeline_error) {
        // Failed-generation row still surfaces in UI so the agent can retry.
        finalVariants.push({
          variant: r.variant,
          subject: "",
          preheader: "",
          body: "",
          status: r.row.status,
          compliance_warning: r.row.compliance_warning,
          pipeline_error: r.row.pipeline_error,
          generated_at: r.row.generated_at,
        });
      }
    }
  }

  return Response.json({ variants: finalVariants });
}

async function generateOneVariant(args: {
  listing: ListingRow;
  agentProfile: Awaited<ReturnType<typeof getProfileForListingStudio>>;
  variant: DotwVariant;
}): Promise<{ subject: string; preheader: string; body: string }> {
  const { listing, agentProfile, variant } = args;
  if (!agentProfile) throw new Error("Missing agent profile");

  const prompt = getDotwPrompt({
    facts: listing.property_facts,
    listingAddress: listing.address,
    agentProfile,
    variant,
    agentNotes: listing.notes,
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
    preheader?: unknown;
    body?: unknown;
  };
  if (
    typeof parsed.subject !== "string" ||
    typeof parsed.body !== "string"
  ) {
    throw new Error("Generated payload missing subject/body");
  }
  return {
    subject: parsed.subject.trim(),
    preheader: typeof parsed.preheader === "string" ? parsed.preheader.trim() : "",
    body: parsed.body.trim(),
  };
}

// ---------------------------------------------------------------------------
// PATCH — save user edits
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
  const variant = body?.variant as string | undefined;
  if (variant !== "a" && variant !== "b") {
    return Response.json({ error: "variant must be 'a' or 'b'" }, { status: 400 });
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

  // Accept either the full structured payload or a partial — merge with existing.
  const { data: existing } = await service
    .from("ls_outputs")
    .select("*")
    .eq("listing_id", id)
    .eq("type", "dotw_email")
    .eq("variant", variant)
    .maybeSingle();

  const prev = unpackContent(existing?.content ?? null) ?? {
    subject: "",
    preheader: "",
    body: "",
  };

  const next = {
    subject: typeof body.subject === "string" ? body.subject : prev.subject,
    preheader: typeof body.preheader === "string" ? body.preheader : prev.preheader,
    body: typeof body.body === "string" ? body.body : prev.body,
  };

  const check = await checkCompliance(
    [next.subject, next.preheader, next.body].join("\n\n"),
    "dotw_email",
  );

  const status =
    body.status === "finalized" || body.status === "draft"
      ? body.status
      : (existing?.status ?? "draft");

  const { data, error } = await service
    .from("ls_outputs")
    .upsert(
      {
        listing_id: id,
        type: "dotw_email",
        variant,
        content: packContent(next),
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

  const v = rowToVariant(data as ListingOutputRow);
  if (!v) return Response.json({ error: "Failed to encode variant" }, { status: 500 });
  return Response.json({ variant: v });
}
