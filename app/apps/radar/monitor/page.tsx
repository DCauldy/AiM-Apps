import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MonitorClient } from "@/components/radar/monitor/MonitorClient";
import type { RadarCheck, RadarResult, RadarQuery } from "@/types/radar";

export default async function RadarMonitorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: config } = await supabase
    .from("radar_config")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!config?.onboarding_completed) {
    redirect("/apps/radar/onboarding");
  }

  // Load checks and latest results in parallel
  const [checksResult, queriesResult] = await Promise.all([
    supabase
      .from("radar_checks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("radar_queries")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  const checks = (checksResult.data as RadarCheck[]) ?? [];

  // Load results for the latest check
  let results: Array<RadarResult & { query?: RadarQuery }> = [];
  if (checks.length > 0) {
    const { data: resultsData } = await supabase
      .from("radar_results")
      .select("*")
      .eq("check_id", checks[0].id)
      .eq("user_id", user.id);

    const queries = (queriesResult.data as RadarQuery[]) ?? [];
    const queryMap = new Map(queries.map((q) => [q.id, q]));

    results = ((resultsData as RadarResult[]) ?? []).map((r) => ({
      ...r,
      query: queryMap.get(r.query_id) ?? undefined,
    }));
  }

  return <MonitorClient checks={checks} results={results} />;
}
