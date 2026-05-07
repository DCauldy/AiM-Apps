import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Load profile, schedule, and CMS connections
  const [profileResult, scheduleResult, cmsResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("bofu_schedules")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("bofu_cms_connections")
      .select("*")
      .eq("user_id", user.id),
  ]);

  if (!profileResult.data?.onboarding_completed) {
    redirect("/apps/blog-engine/onboarding");
  }

  const schedule = scheduleResult.data;

  return (
    <SettingsClient
      profile={profileResult.data}
      schedule={schedule}
      cmsConnections={cmsResult.data || []}
      frequencyTier={schedule?.frequency_tier || "free"}
      hasSubscription={!!schedule?.stripe_subscription_id}
    />
  );
}
