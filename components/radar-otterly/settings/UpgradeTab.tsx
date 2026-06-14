"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { RADAR_INCLUDED_TIER, RADAR_PACKS } from "@/lib/radar-packs";
import { RadarUpgradeModal } from "@/components/radar-otterly/RadarUpgradeModal";

// Mirrors the Blog Engine / Hyperlocal / Listing Studio pattern:
//   1. Top card — current tier pill + "Manage Subscription" (when on
//      a paid pack) OR "Pro (included)" pill + "See packs" CTA.
//   2. Pack ladder — small cards click-to-open the upgrade modal.
//
// Current-tier detection lands later once we have a
// user_radar_subscriptions table. For now we surface "Pro (included)"
// as the implicit starter state and let any pack click trigger the
// upgrade modal.

export function UpgradeTab() {
  const { addToast } = useToast();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [managing, setManaging] = useState(false);

  // Until we have a user_radar_subscriptions table, we don't know the
  // user's current Radar pack. Treat everyone as "Pro (included)"
  // (starter allocation). Pack cards always open the upgrade modal.
  const hasSubscription = false;
  const currentPackId: string | null = null;

  const handleManage = async () => {
    setManaging(true);
    try {
      const res = await fetch("/api/apps/radar/manage-subscription", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        addToast({
          title: "Error",
          description: data.error || "Failed to open subscription portal",
          variant: "destructive",
        });
      }
    } catch {
      addToast({
        title: "Error",
        description: "Network error — could not reach server",
        variant: "destructive",
      });
    } finally {
      setManaging(false);
    }
  };

  return (
    <div className="space-y-6">
      {hasSubscription ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)",
                  }}
                >
                  <Zap className="h-3 w-3" />
                  {currentPackId
                    ? RADAR_PACKS.find((p) => p.id === currentPackId)?.tier
                    : "Bronze"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Update card, change tier, or cancel through the Stripe billing
                portal.
              </p>
            </div>
            <button
              onClick={handleManage}
              disabled={managing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {managing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Manage Subscription
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-muted text-foreground">
                  Pro (included)
                </span>
                <span className="text-sm text-muted-foreground">
                  Included with your AiM Pro membership
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upgrade for more tracked prompts, competitors, and faster
                refresh.
              </p>
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white transition-opacity hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)",
              }}
            >
              <Zap className="h-3.5 w-3.5" />
              See packs
            </button>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border text-xs">
            <IncludedStat
              label="Tracked prompts"
              value={RADAR_INCLUDED_TIER.prompts}
            />
            <IncludedStat
              label="Competitors"
              value={RADAR_INCLUDED_TIER.competitors}
            />
            <IncludedStat
              label="URL audits / mo"
              value={RADAR_INCLUDED_TIER.auditsPerMonth}
            />
            <IncludedStat
              label="Refresh"
              value={
                RADAR_INCLUDED_TIER.refreshFrequency === "weekly"
                  ? "Weekly"
                  : "Daily"
              }
            />
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">All packs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {RADAR_PACKS.map((pack) => {
            const isCurrent = hasSubscription && currentPackId === pack.id;
            const refreshLabel =
              pack.refreshFrequency === "weekly"
                ? "weekly"
                : pack.refreshFrequency === "daily"
                  ? "daily"
                  : "2x daily";
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className={cn(
                  "text-left rounded-lg border p-4 transition-colors",
                  isCurrent
                    ? "border-[#e0a458] bg-[#e0a458]/5"
                    : "border-border hover:border-[#1c4c8a]/50",
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">
                    {pack.tier}
                  </span>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#e0a458]">
                      <Check className="h-3 w-3" />
                      Current
                    </span>
                  )}
                  {pack.bestValue && !isCurrent && (
                    <span className="inline-flex items-center text-[10px] font-medium text-white bg-[#e0a458] px-1.5 py-0.5 rounded">
                      Best value
                    </span>
                  )}
                </div>
                <div className="text-xl font-semibold text-foreground">
                  ${(pack.priceCents / 100).toFixed(0)}
                  <span className="text-xs font-normal text-muted-foreground">
                    /mo
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                  <div>
                    <span className="text-foreground font-medium tabular-nums">
                      {pack.prompts}
                    </span>{" "}
                    prompts ·{" "}
                    <span className="text-foreground font-medium tabular-nums">
                      {pack.competitors}
                    </span>{" "}
                    competitors
                  </div>
                  <div>{refreshLabel} refresh</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <RadarUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="cta"
      />
    </div>
  );
}

function IncludedStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <li>
      <div className="text-base font-semibold text-foreground tabular-nums">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </li>
  );
}
