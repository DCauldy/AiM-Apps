"use client";

import { useRouter } from "next/navigation";
import { OnboardingChat } from "@/components/blog-engine/onboarding/OnboardingChat";
import { ProfileMigrationBanner } from "@/components/profile/ProfileMigrationBanner";

export function OnboardingClient() {
  const router = useRouter();

  const handleComplete = () => {
    router.push("/apps/blog-engine/dashboard");
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6">
        <ProfileMigrationBanner what="Identity, brokerage, market, target clients, brand colors, and CTAs" />
      </div>
      <div className="flex-1 min-h-0">
        <OnboardingChat onComplete={handleComplete} />
      </div>
    </div>
  );
}
