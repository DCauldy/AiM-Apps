"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RadarUpgradeSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect after 5 seconds
    const timer = setTimeout(() => {
      router.push("/apps/radar/dashboard");
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <CheckCircle className="h-16 w-16 text-[#e0a458] mx-auto" />
        <h1 className="text-2xl font-bold">Upgrade Successful!</h1>
        <p className="text-muted-foreground">
          Your Radar plan has been upgraded. Your new limits are now active.
        </p>
        <Button
          onClick={() => router.push("/apps/radar/dashboard")}
          className="bg-[#e0a458] hover:bg-[#c88d3e] text-white"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
