"use client";

import { Radar } from "lucide-react";

import { PlanUpgradeDialog } from "@/components/app-shell/PlanUpgradeDialog";
import { RADAR_PACKS, type RadarPack } from "@/lib/radar-packs";

interface RadarUpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

export function RadarUpgradeModal({ open, onClose }: RadarUpgradeModalProps) {
  return (
    <PlanUpgradeDialog
      open={open}
      onClose={onClose}
      plans={RADAR_PACKS}
      subscribeEndpoint="/api/apps/radar/subscribe"
      headerIcon={<Radar className="h-5 w-5 text-white" />}
      headerTitle="Upgrade Radar"
      headerDescription={
        <>
          Track more queries, run manual checks, and monitor weekly for deeper
          AI visibility insights.
        </>
      }
      headerGradient="linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)"
      headerBackground="linear-gradient(135deg, rgba(28,76,138,0.08) 0%, rgba(224,164,88,0.08) 100%)"
      bestValueGradient="linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)"
      bestValueClassName="border-[#e0a458] bg-[#e0a458]/5"
      selectedClassName="border-[#e0a458] bg-[#e0a458]/10"
      hoverClassName="border-border hover:border-[#e0a458]/50"
      planMeta={(pack: RadarPack) => {
        const monthlyCost = (pack.priceCents / 100).toFixed(0);
        return `$${monthlyCost}/mo · ${pack.monitoringFrequency} monitoring`;
      }}
      infoText="Pro includes 25 queries and monthly monitoring. Subscriptions are monthly and can be cancelled anytime from Settings."
      ctaClassName="bg-[#e0a458] hover:bg-[#c88d3e] text-white"
    />
  );
}
