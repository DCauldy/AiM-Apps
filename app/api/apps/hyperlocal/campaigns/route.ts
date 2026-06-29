import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "name",
  "segmentation",
  "custom_segmentation_field",
  "property_type_filters",
  "price_range_low",
  "price_range_high",
  "source_filters",
  "lens",
  "min_segment_size",
  "service_area_zips",
  "is_active",
] as const;

function pickAllowed(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("hl_campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Attach the most recent run timestamp per campaign so the list can show
  // "last run" / "never run". One query over the user's runs, reduced to a
  // max(started_at|created_at) per campaign_id.
  const campaigns = data ?? [];
  if (campaigns.length > 0) {
    const { data: runs } = await supabase
      .from("hl_runs")
      .select("campaign_id, started_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const lastRun: Record<string, string> = {};
    for (const r of runs ?? []) {
      if (!r.campaign_id) continue;
      const ts = r.started_at ?? r.created_at;
      if (ts && !lastRun[r.campaign_id]) lastRun[r.campaign_id] = ts;
    }
    return Response.json({
      campaigns: campaigns.map((c) => ({
        ...c,
        last_run_at: lastRun[c.id] ?? null,
      })),
    });
  }

  return Response.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const payload = pickAllowed(body);

  if (!payload.name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("hl_campaigns")
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ campaign: data });
}
