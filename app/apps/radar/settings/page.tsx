import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/radar/settings/SettingsClient";
import type { RadarConfig, RadarCompetitor } from "@/types/radar";

export default async function RadarSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [configResult, competitorsResult] = await Promise.all([
    supabase
      .from("radar_config")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("radar_competitors")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!configResult.data?.onboarding_completed) {
    redirect("/apps/radar/onboarding");
  }

  return (
    <SettingsClient
      config={configResult.data as RadarConfig}
      competitors={(competitorsResult.data as RadarCompetitor[]) ?? []}
    />
  );
}
