import { WelcomeScreen } from "@/components/radar/WelcomeScreen";
import { redirectIfOnboardingComplete } from "@/lib/apps/onboarding";

export default async function RadarPage() {
  await redirectIfOnboardingComplete({
    profileTable: "radar_config",
    dashboardHref: "/apps/radar/dashboard",
  });

  return <WelcomeScreen />;
}
