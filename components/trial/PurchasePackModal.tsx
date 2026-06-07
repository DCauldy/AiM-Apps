"use client";

import { Sparkles } from "lucide-react";

import { PlanUpgradeDialog } from "@/components/app-shell/PlanUpgradeDialog";
import { PROMPT_PACKS, type PromptPack } from "@/lib/prompt-packs";

interface PurchasePackModalProps {
  open: boolean;
  onClose: () => void;
  reason?: "limit" | "cta";
  currentUsage?: { used: number; limit: number };
  resetDate?: string;
}

/**
 * Prompt Studio prompt-pack purchase modal.
 *
 * Thin wrapper around the shared PlanUpgradeDialog so the visual is
 * identical to BlogUpgradeModal / RadarUpgradeModal — gradient header
 * tile, pack cards with the Diamond "Best Value" highlight, single
 * Subscribe CTA. The post to /api/apps/prompt-studio/purchase-pack
 * mirrors the Blog Engine and Radar subscribe endpoints.
 */
export function PurchasePackModal({
  open,
  onClose,
  reason = "cta",
  currentUsage,
  resetDate,
}: PurchasePackModalProps) {
  const resetFormatted = resetDate
    ? new Date(resetDate).toLocaleDateString([], { month: "long", day: "numeric" })
    : null;

  return (
    <PlanUpgradeDialog
      open={open}
      onClose={onClose}
      plans={PROMPT_PACKS}
      subscribeEndpoint="/api/apps/prompt-studio/purchase-pack"
      headerIcon={<Sparkles className="h-5 w-5 text-white" />}
      headerTitle={reason === "limit" ? "Monthly limit reached" : "Buy more prompts"}
      headerDescription={
        reason === "limit" ? (
          <>
            You&apos;ve used all{" "}
            {currentUsage ? `${currentUsage.limit} prompts` : "your prompts"}{" "}
            this month.
            {resetFormatted ? ` Your limit resets on ${resetFormatted}.` : ""}{" "}
            Pick a pack to keep going right away.
          </>
        ) : (
          <>
            Top up your monthly allotment with a one-time pack of additional
            prompts. Diamond is the best value.
          </>
        )
      }
      headerGradient="linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)"
      headerBackground="linear-gradient(135deg, rgba(28,76,138,0.08) 0%, rgba(49,219,165,0.08) 100%)"
      bestValueGradient="linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)"
      bestValueClassName="border-[#31DBA5] bg-[#31DBA5]/5"
      selectedClassName="border-primary bg-primary/5"
      hoverClassName="border-border hover:border-primary/50"
      planMeta={(pack: PromptPack) => {
        const dollars = (pack.priceCents / 100).toFixed(2);
        const perPrompt = (pack.priceCents / 100 / pack.size).toFixed(2);
        return `$${dollars} one-time · ~$${perPrompt}/prompt`;
      }}
      infoText="Packs are one-time purchases that stack on top of your monthly limit. Cancel any time from Settings."
    />
  );
}
