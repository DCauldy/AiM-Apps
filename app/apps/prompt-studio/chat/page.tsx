"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useThreads } from "@/hooks/useThreads";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useToast } from "@/components/ui/toast";
import { UpgradeModal } from "@/components/trial/UpgradeModal";
import { FEATURES } from "@/lib/feature-flags";
import dynamic from "next/dynamic";
import type { PromptType } from "@/types";

const PurchasePackModal = FEATURES.PROMPT_PACKS
  ? dynamic(() => import("@/components/trial/PurchasePackModal").then((m) => m.PurchasePackModal), { ssr: false })
  : () => null;

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, createThread } = useThreads();
  const { addToast } = useToast();

  const prefill = searchParams?.get("prefill") || "";

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [upgradeResetDate, setUpgradeResetDate] = useState<string | undefined>();
  const [upgradeAccountType, setUpgradeAccountType] = useState<"standalone" | "aim_member" | undefined>();
  const [limitReached, setLimitReached] = useState(false);

  // Check trial status on mount
  useEffect(() => {
    fetch("/api/apps/prompt-studio/trial-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.effectiveRemaining <= 0) {
          setLimitReached(true);
          setUpgradeAccountType(data.accountType);
          setUpgradeResetDate(data.resetDate);
        }
      })
      .catch(() => {});
  }, []);

  const handleSend = async (content: string, promptType?: PromptType) => {
    try {
      const newThread = await createThread("New Conversation");

      if (newThread?.id) {
        const redirectUrl = `/apps/prompt-studio/chat/${newThread.id}?lazyPrompt=${encodeURIComponent(content)}&promptType=${encodeURIComponent(promptType ?? "auto")}`;
        router.push(redirectUrl);
      } else {
        throw new Error("Failed to create thread");
      }
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to create conversation. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <ChatWindow
        messages={[]}
        isLoading={false}
        onSend={handleSend}
        threadId={undefined}
        initialValue={prefill}
        limitReached={limitReached}
        onShowUpgrade={() => setShowUpgradeModal(true)}
      />
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="limit"
        resetDate={upgradeResetDate}
        accountType={upgradeAccountType}
        onBuyPack={() => {
          setShowUpgradeModal(false);
          setShowPurchaseModal(true);
        }}
      />
      <PurchasePackModal
        open={showPurchaseModal}
        onClose={() => {
          setShowPurchaseModal(false);
        }}
      />
    </>
  );
}
