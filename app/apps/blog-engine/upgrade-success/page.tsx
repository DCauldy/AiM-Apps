"use client";

import { useEffect } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";

export default function UpgradeSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    window.dispatchEvent(new Event("blog-usage-updated"));
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <CheckCircle className="h-14 w-14 mx-auto text-emerald-500" />
        <h1 className="text-xl font-bold text-foreground">
          Subscription Active!
        </h1>
        <p className="text-sm text-muted-foreground">
          Your blog frequency has been upgraded. Your new weekly limit is now active and will be reflected on your dashboard.
        </p>
        <Button onClick={() => router.push("/apps/blog-engine/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
