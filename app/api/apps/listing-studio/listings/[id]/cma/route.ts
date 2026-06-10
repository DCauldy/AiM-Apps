import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { inngest } from "@/lib/inngest/client";
import { runCmaPipeline } from "@/lib/listing-studio/cma/pipeline";
import { incrementCmaCount } from "@/lib/listing-studio/usage";
import { NextRequest } from "next/server";
import type { CmaRunRow } from "@/types/listing-studio";

export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV === "development";

// ============================================================
// POST /api/apps/listing-studio/listings/[id]/cma
//   Kicks off the CMA pipeline. Sync in dev, Inngest in prod.
//   Returns immediately; the UI polls GET for the row.
//
// GET  /api/apps/listing-studio/listings/[id]/cma
//   Returns the most recent ls_cma_runs row for this listing (or null).
// ============================================================

export async function POST(
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

  // Ownership check before any meter increment.
  const service = createServiceRoleClient();
  const { data: listing } = await service
    .from("ls_listings")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const useApi = body.useApi !== false; // default on
  const useCsv = body.useCsv === true;
  const radius_mi = typeof body.radius_mi === "number" ? body.radius_mi : undefined;
  const months_back =
    typeof body.months_back === "number" ? body.months_back : undefined;

  if (!useApi && !useCsv) {
    return Response.json(
      { error: "At least one comp source must be enabled (useApi or useCsv)." },
      { status: 400 },
    );
  }

  // Bump the CMA counter — best-effort, soft cap is enforced at UI layer.
  // RapidAPI cost is the real concern; we don't gate but we do track.
  await incrementCmaCount(user.id).catch((e) => {
    console.error("[Listing Studio] incrementCmaCount failed:", e);
  });

  if (isDev) {
    runCmaPipeline({
      userId: user.id,
      listingId: id,
      useApi,
      useCsv,
      radius_mi,
      months_back,
    }).catch((err) => {
      console.error("[Listing Studio] CMA pipeline failed (dev):", err);
    });
    return Response.json({ success: true, message: "CMA started (dev mode)" });
  }

  await inngest.send({
    name: "listing-studio/cma.requested",
    data: {
      userId: user.id,
      listingId: id,
      useApi,
      useCsv,
      radius_mi,
      months_back,
    },
  });

  return Response.json({ success: true, message: "CMA started" });
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

  // RLS scopes to listings the user owns, so an extra ownership check
  // would be redundant here — the listing-row check guards the POST.
  const { data, error } = await supabase
    .from("ls_cma_runs")
    .select("*")
    .eq("listing_id", id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ run: (data as CmaRunRow | null) ?? null });
}
