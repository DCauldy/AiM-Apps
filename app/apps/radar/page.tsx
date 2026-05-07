import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WelcomeScreen } from "@/components/radar/WelcomeScreen";

export default async function RadarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user has completed onboarding
  const { data: config } = await supabase
    .from("radar_config")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (config?.onboarding_completed) {
    redirect("/apps/radar/dashboard");
  }

  return <WelcomeScreen />;
}
