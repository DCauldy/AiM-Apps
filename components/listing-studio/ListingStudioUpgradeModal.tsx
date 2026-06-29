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
  currentUsage?: { activeClients: number; activeClientsLimit: number };
}

export function ListingStudioUpgradeModal({
  open,
  onClose,
  reason = "cta",
  currentUsage,
}: ListingStudioUpgradeModalProps) {
  return (
    <PlanUpgradeDialog
      open={open}
      onClose={onClose}
      plans={LISTING_STUDIO_PACKS}
      subscribeEndpoint="/api/apps/listing-studio/subscribe"
      headerIcon={<Home className="h-5 w-5 text-white" />}
      headerTitle={
        reason === "limit"
          ? "Client limit reached"
          : "Enroll more clients"
      }
      headerDescription={
        reason === "limit" ? (
          <>
            You&apos;ve enrolled all{" "}
            {currentUsage
              ? `${currentUsage.activeClientsLimit} clients`
              : "your client slots"}
            . Unenroll a client to free a slot, or upgrade for a larger cap.
          </>
        ) : (
          <>
            Upgrade your CMA pack to enroll more past clients in the
            automated quarterly cadence. Diamond unlocks unlimited clients
            (fair use).
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
        const perClientCost =
          pack.activeClientsLimit === UNLIMITED
            ? "—"
            : (
                pack.priceCents /
                100 /
                (pack.activeClientsLimit as number)
              ).toFixed(2);
        return `$${monthlyCost}/mo · ~$${perClientCost}/client`;
      }}
      infoText="All Pro subscriptions include 25 active clients on automated quarterly cadence. Pack subscriptions are monthly and can be cancelled anytime from Settings."
    />
  );
}
