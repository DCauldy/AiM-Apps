"use client";

import { Radar } from "lucide-react";

import { PlanUpgradeDialog } from "@/components/app-shell/PlanUpgradeDialog";
import { RADAR_PACKS, type RadarPack } from "@/lib/radar-packs";

interface RadarUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: "limit" | "cta";
  currentUsage?: { promptsUsed: number; promptsLimit: number };
}

// Thin wrapper around PlanUpgradeDialog that wires in Radar's pack
// list + brand styling. Matches the Blog Engine / Hyperlocal / Listing
// Studio upgrade-modal pattern so the four products feel consistent.
export function RadarUpgradeModal({
  open,
  onClose,
  reason = "cta",
  currentUsage,
}: RadarUpgradeModalProps) {
  return (
    <PlanUpgradeDialog
      open={open}
      onClose={onClose}
      plans={RADAR_PACKS}
      subscribeEndpoint="/api/apps/radar/subscribe"
      headerIcon={<Radar className="h-5 w-5 text-white" />}
      headerTitle={
        reason === "limit" ? "Tracking quota reached" : "Upgrade Radar"
      }
      headerDescription={
        reason === "limit" ? (
          <>
            You&apos;ve used{" "}
            <strong>
              {currentUsage?.promptsUsed ?? 0}/{currentUsage?.promptsLimit ?? 0}
            </strong>{" "}
            tracked prompts. Upgrade for more prompts, competitors, and faster
            refresh.
          </>
        ) : (
          <>
            Track more prompts, more competitors, and refresh more often for
            sharper AI visibility insights.
          </>
        )
      }
      headerGradient="linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)"
      headerBackground="linear-gradient(135deg, rgba(28,76,138,0.08) 0%, rgba(224,164,88,0.08) 100%)"
      bestValueGradient="linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)"
      bestValueClassName="border-[#e0a458] bg-[#e0a458]/5"
      selectedClassName="border-[#e0a458] bg-[#e0a458]/10"
      hoverClassName="border-border hover:border-[#e0a458]/50"
      planMeta={(pack: RadarPack) => {
        const refreshLabel =
          pack.refreshFrequency === "weekly"
            ? "weekly"
            : pack.refreshFrequency === "daily"
              ? "daily"
              : "2x daily";
        return `${pack.prompts} prompts · ${pack.competitors} competitors · ${refreshLabel}`;
      }}
      infoText="Subscriptions are monthly and can be cancelled anytime from Settings → Upgrade."
      ctaClassName="bg-[#e0a458] hover:bg-[#c88d3e] text-white"
    />
  );
}
