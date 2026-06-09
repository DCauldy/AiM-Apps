import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { DashboardClient } from "@/components/radar/dashboard/DashboardClient";
import { getRadarUsage } from "@/lib/radar/usage";
import type { RadarConfig, RadarCheck, RadarAlert, RadarResult } from "@/types/radar";

export default async function RadarDashboardPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: config } = await supabase
    .from("radar_config")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!config?.onboarding_completed) {
    redirect("/apps/radar/onboarding");
  }

  // Load dashboard data in parallel
  const [latestCheckResult, alertsResult, usage] = await Promise.all([
    supabase
      .from("radar_checks")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["completed", "completed_partial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("radar_alerts")
      .select("*")
      .eq("user_id", user.id)
      .order("read", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(20),
    getRadarUsage(user.id),
  ]);

  // Fetch results for the latest completed check
  let latestResults: RadarResult[] = [];
  if (latestCheckResult.data) {
    const { data: results } = await supabase
      .from("radar_results")
      .select("*")
      .eq("check_id", latestCheckResult.data.id)
      .eq("user_id", user.id);
    latestResults = (results as RadarResult[]) ?? [];
  }

  return (
    <DashboardClient
      config={config as RadarConfig}
      latestCheck={(latestCheckResult.data as RadarCheck) ?? null}
      latestResults={latestResults}
      alerts={(alertsResult.data as RadarAlert[]) ?? []}
      usage={usage}
    />
  );
}
