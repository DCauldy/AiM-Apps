import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WelcomeScreen } from "@/components/blog-engine/WelcomeScreen";
import { redirectIfOnboardingComplete } from "@/lib/apps/onboarding";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";

export default async function BlogEnginePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Platform profile is the universal gate: brand colors, market, sender
  // info — every per-app onboarding builds on top of it.
  await requireActiveProfileOrRedirect(user.id, "/apps/blog-engine");

  await redirectIfOnboardingComplete({
    profileTable: "bofu_schedules",
    dashboardHref: "/apps/blog-engine/dashboard",
  });

  return <WelcomeScreen />;
}
