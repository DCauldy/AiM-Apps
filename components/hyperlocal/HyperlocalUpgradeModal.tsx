"use client";

import { Mail } from "lucide-react";

import { PlanUpgradeDialog } from "@/components/app-shell/PlanUpgradeDialog";
import {
  HYPERLOCAL_PACKS,
  UNLIMITED,
  type HyperlocalPack,
} from "@/lib/hyperlocal-packs";

interface HyperlocalUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: "limit" | "cta";
  periodEnd?: string;
  currentUsage?: { campaignsThisMonth: number; campaignsLimit: number };
}

export function HyperlocalUpgradeModal({
  open,
  onClose,
  reason = "cta",
  periodEnd,
  currentUsage,
}: HyperlocalUpgradeModalProps) {
  const resetFormatted = periodEnd
    ? new Date(periodEnd).toLocaleDateString([], {
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <PlanUpgradeDialog
      open={open}
      onClose={onClose}
      plans={HYPERLOCAL_PACKS}
      subscribeEndpoint="/api/apps/hyperlocal/subscribe"
      headerIcon={<Mail className="h-5 w-5 text-white" />}
      headerTitle={
        reason === "limit"
          ? "Monthly campaign limit reached"
          : "Send more hyperlocal campaigns"
      }
      headerDescription={
        reason === "limit" ? (
          <>
            You&apos;ve launched all{" "}
            {currentUsage
              ? `${currentUsage.campaignsLimit} campaigns`
              : "your campaigns"}{" "}
            this month.
            {resetFormatted ? ` Your limit resets on ${resetFormatted}.` : ""}{" "}
            Upgrade for more campaigns + deeper MLS history.
          </>
        ) : (
          <>
            Upgrade your Hyperlocal pack for more monthly campaigns, larger
            per-campaign segments, deeper MLS snapshot history, and unlimited
            AI edit-chat turns.
          </>
        )
      }
      // Brand: rose → purple gradient matches the Hyperlocal app identity.
      headerGradient="linear-gradient(135deg, #E11D48 0%, #7C3AED 100%)"
      headerBackground="linear-gradient(135deg, rgba(225,29,72,0.08) 0%, rgba(124,58,237,0.08) 100%)"
      bestValueGradient="linear-gradient(135deg, #E11D48 0%, #7C3AED 100%)"
      bestValueClassName="border-[#E11D48] bg-[#E11D48]/5"
      selectedClassName="border-primary bg-primary/5"
      hoverClassName="border-border hover:border-primary/50"
      planMeta={(pack: HyperlocalPack) => {
        const monthlyCost = (pack.priceCents / 100).toFixed(0);
        const perCampaignCost =
          pack.campaignsPerMonth === UNLIMITED
            ? "—"
            : (
                pack.priceCents /
                100 /
                (pack.campaignsPerMonth as number)
              ).toFixed(2);
        return `$${monthlyCost}/mo · ~$${perCampaignCost}/campaign`;
      }}
      infoText="All Pro subscriptions include 4 campaigns/month free. Pack subscriptions are monthly and can be cancelled anytime from Settings."
    />
  );
}
