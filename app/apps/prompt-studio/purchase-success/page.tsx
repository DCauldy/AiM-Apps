"use client";

import { useEffect } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function PurchaseSuccessPage() {
  const router = useRouter();

  // Trigger usage refresh so sidebar picks up new bonus credits
  useEffect(() => {
    window.dispatchEvent(new Event("trial-usage-updated"));
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <CheckCircle className="h-14 w-14 mx-auto text-emerald-500" />
        <h1 className="text-xl font-bold text-foreground">
          Purchase Complete!
        </h1>
        <p className="text-sm text-muted-foreground">
          Your bonus prompts have been added to your account. They never expire and will be used automatically after your monthly prompts run out.
        </p>
        <Button onClick={() => router.push("/apps/prompt-studio/chat")}>
          Back to Prompt Studio
        </Button>
      </div>
    </div>
  );
}
