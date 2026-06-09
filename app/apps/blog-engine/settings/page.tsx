import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileForBlogEngine } from "@/lib/profiles/effective-profile";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Load schedule (includes the Blog Engine app-specific fields:
  // CTAs, blog_tone, include_disclaimers, onboarding_completed),
  // CMS connections, and a unified profile object for legacy UI rendering.
  const [scheduleResult, cmsResult, effectiveProfile] = await Promise.all([
    supabase
      .from("bofu_schedules")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("bofu_cms_connections")
      .select("*")
      .eq("user_id", user.id),
    getProfileForBlogEngine(user.id),
  ]);

  if (!scheduleResult.data?.onboarding_completed) {
    redirect("/apps/blog-engine/onboarding");
  }

  if (!effectiveProfile) {
    redirect("/apps/profile/new?return_to=/apps/blog-engine/settings");
  }

  const schedule = scheduleResult.data;

  return (
    <SettingsClient
      profile={effectiveProfile}
      schedule={schedule}
      cmsConnections={cmsResult.data || []}
      hasSubscription={!!schedule?.stripe_subscription_id}
    />
  );
}
