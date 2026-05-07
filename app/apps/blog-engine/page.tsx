import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WelcomeScreen } from "@/components/blog-engine/WelcomeScreen";

export default async function BlogEnginePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user has completed onboarding
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) {
    // Onboarding complete — go to dashboard
    redirect("/apps/blog-engine/dashboard");
  }

  // Show welcome screen for new users
  return <WelcomeScreen />;
}
