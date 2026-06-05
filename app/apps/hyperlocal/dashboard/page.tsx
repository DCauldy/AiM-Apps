import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { HyperlocalDashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function HyperlocalDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: crmConnections },
    { data: emailConnections },
    { data: recentRuns },
    { count: suppressionCount },
    { data: campaigns },
  ] = await Promise.all([
    supabase
      .from("hl_crm_connections")
      .select("id, platform, label, is_active, last_synced_at, last_error")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("hl_email_connections")
      .select("id, provider, email_address, display_name, is_default, is_active, last_send_at")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false }),
    supabase
      .from("hl_runs")
      .select("id, campaign_id, phase, contacts_fetched, emails_sent, emails_failed, started_at, completed_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("hl_suppressions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("hl_campaigns")
      .select("id, name, segmentation, lens, is_active")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <HyperlocalDashboardClient
      crmConnections={crmConnections ?? []}
      emailConnections={emailConnections ?? []}
      recentRuns={recentRuns ?? []}
      suppressionCount={suppressionCount ?? 0}
      campaigns={campaigns ?? []}
    />
  );
}
