import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RadarSetupForm } from "@/components/radar/onboarding/RadarSetupForm";
import { ProfileMigrationBanner } from "@/components/profile/ProfileMigrationBanner";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";
import { getProfileForBlogEngine } from "@/lib/profiles/effective-profile";

export default async function RadarOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await requireActiveProfileOrRedirect(user.id, "/apps/radar/onboarding");

  const { data: config } = await supabase
    .from("radar_config")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (config?.onboarding_completed) {
    redirect("/apps/radar/dashboard");
  }

  // Identity comes from the active profile (or legacy user_profiles via the
  // adapter during the transition). The chat-only Path B is retired since the
  // guard above ensures an active profile is always present by this point.
  const profile = await getProfileForBlogEngine(user.id);
  if (!profile) {
    redirect("/apps/profile/new?return_to=/apps/radar/onboarding");
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 pt-6">
        <ProfileMigrationBanner what="Agent name, brokerage, market, and specializations" />
      </div>
      <RadarSetupForm profile={profile as unknown as { full_name?: string; business_name?: string; [key: string]: unknown }} />
    </div>
  );
}
