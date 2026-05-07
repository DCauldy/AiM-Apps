"use client";

import { useRouter } from "next/navigation";
import { OnboardingChat } from "@/components/blog-engine/onboarding/OnboardingChat";

export default function OnboardingPage() {
  const router = useRouter();

  const handleComplete = () => {
    // Navigate to dashboard after onboarding completes
    router.push("/apps/blog-engine/dashboard");
  };

  return (
    <div className="h-full flex flex-col">
      <OnboardingChat onComplete={handleComplete} />
    </div>
  );
}
