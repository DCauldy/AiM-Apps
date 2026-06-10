"use client";

import { Home } from "lucide-react";

import { PlanUpgradeDialog } from "@/components/app-shell/PlanUpgradeDialog";
import {
  LISTING_STUDIO_PACKS,
  UNLIMITED,
  type ListingStudioPack,
} from "@/lib/listing-studio-packs";

interface ListingStudioUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: "limit" | "cta";
  periodEnd?: string;
  currentUsage?: { activeListingsPromoted: number; activeListingsLimit: number };
}

export function ListingStudioUpgradeModal({
  open,
  onClose,
  reason = "cta",
  periodEnd,
  currentUsage,
}: ListingStudioUpgradeModalProps) {
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
      plans={LISTING_STUDIO_PACKS}
      subscribeEndpoint="/api/apps/listing-studio/subscribe"
      headerIcon={<Home className="h-5 w-5 text-white" />}
      headerTitle={
        reason === "limit"
          ? "Monthly listing limit reached"
          : "Promote more listings"
      }
      headerDescription={
        reason === "limit" ? (
          <>
            You&apos;ve promoted all{" "}
            {currentUsage
              ? `${currentUsage.activeListingsLimit} listings`
              : "your listings"}{" "}
            this month.
            {resetFormatted ? ` Your limit resets on ${resetFormatted}.` : ""}{" "}
            Upgrade for more active listings + larger prospect CMA caps.
          </>
        ) : (
          <>
            Upgrade your Listing Studio pack for more active listings per
            month, a larger prospect-CMA budget, and the full Diamond
            unlimited-listing tier.
          </>
        )
      }
      // Brand: slate → warm-gold gradient matches the Listing Studio identity.
      headerGradient="linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)"
      headerBackground="linear-gradient(135deg, rgba(30,41,59,0.08) 0%, rgba(212,163,92,0.08) 100%)"
      bestValueGradient="linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)"
      bestValueClassName="border-[#D4A35C] bg-[#D4A35C]/5"
      selectedClassName="border-primary bg-primary/5"
      hoverClassName="border-border hover:border-primary/50"
      planMeta={(pack: ListingStudioPack) => {
        const monthlyCost = (pack.priceCents / 100).toFixed(0);
        const perListingCost =
          pack.activeListingsPerMonth === UNLIMITED
            ? "—"
            : (
                pack.priceCents /
                100 /
                (pack.activeListingsPerMonth as number)
              ).toFixed(2);
        return `$${monthlyCost}/mo · ~$${perListingCost}/listing`;
      }}
      infoText="All Pro subscriptions include 1 active listing/month + 10 prospect CMAs. Pack subscriptions are monthly and can be cancelled anytime from Settings."
    />
  );
}
