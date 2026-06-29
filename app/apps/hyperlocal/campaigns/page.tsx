import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CampaignsClient } from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function HyperlocalCampaignsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: campaigns } = await supabase
    .from("hl_campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  // Attach the most-recent-run timestamp per campaign (matches the list API)
  // so the card shows "Last run …" / "Never run" on first paint.
  const list = campaigns ?? [];
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

  return (
    <CampaignsClient
      initialCampaigns={list.map((c) => ({
        ...c,
        last_run_at: lastRun[c.id] ?? null,
      }))}
    />
  );
}
