import { WelcomeScreen } from "@/components/blog-engine/WelcomeScreen";
import { redirectIfOnboardingComplete } from "@/lib/apps/onboarding";

export default async function BlogEnginePage() {
  await redirectIfOnboardingComplete({
    profileTable: "bofu_schedules",
    dashboardHref: "/apps/blog-engine/dashboard",
  });

  return <WelcomeScreen />;
}
