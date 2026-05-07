import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResearchClient } from "@/components/radar/research/ResearchClient";
import type {
  RadarQuery,
  RadarQuerySuggestion,
  RadarCompetitor,
  RadarResult,
} from "@/types/radar";

export default async function RadarResearchPage() {
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

  // Load research data in parallel
  const [queriesResult, suggestionsResult, competitorsResult, latestCheckResult] =
    await Promise.all([
      supabase
        .from("radar_queries")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("radar_query_suggestions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "suggested")
        .order("created_at", { ascending: false }),
      supabase
        .from("radar_competitors")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("radar_checks")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // Load results for the latest check (for competitor leaderboard and gap analysis)
  let results: RadarResult[] = [];
  if (latestCheckResult.data?.id) {
    const { data: resultsData } = await supabase
      .from("radar_results")
      .select("*")
      .eq("check_id", latestCheckResult.data.id)
      .eq("user_id", user.id);
    results = (resultsData as RadarResult[]) ?? [];
  }

  return (
    <ResearchClient
      queries={(queriesResult.data as RadarQuery[]) ?? []}
      suggestions={(suggestionsResult.data as RadarQuerySuggestion[]) ?? []}
      competitors={(competitorsResult.data as RadarCompetitor[]) ?? []}
      results={results}
    />
  );
}
