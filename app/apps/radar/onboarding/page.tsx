import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingChat } from "@/components/radar/onboarding/OnboardingChat";
import { RadarSetupForm } from "@/components/radar/onboarding/RadarSetupForm";

export default async function RadarOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check if already onboarded
  const { data: config } = await supabase
    .from("radar_config")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (config?.onboarding_completed) {
    redirect("/apps/radar/dashboard");
  }

  // Check for existing profile (Path A vs Path B)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile) {
    // Path A: profile exists — show setup form
    return <RadarSetupForm profile={profile} />;
  }

  // Path B: no profile — show chat onboarding
  return (
    <div className="flex-1 overflow-hidden">
      <OnboardingChat />
    </div>
  );
}
