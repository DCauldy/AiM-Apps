"use client";

import { useState } from "react";
import { Loader2, ExternalLink, Zap, Check } from "lucide-react";

import { HyperlocalUpgradeModal } from "@/components/hyperlocal/HyperlocalUpgradeModal";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import {
  HYPERLOCAL_PACKS,
  HYPERLOCAL_BASE,
  UNLIMITED,
  formatPackLimit,
  getHyperlocalPackById,
  type HyperlocalPack,
} from "@/lib/hyperlocal-packs";
import { cn } from "@/lib/utils";

// ============================================================
// Hyperlocal Settings → Upgrade tab.
//
// Two shapes:
//   • No active pack → show base Pro allowances + the full pack
//     ladder with a single CTA that opens HyperlocalUpgradeModal.
//   • Active pack    → show the current tier + meter summary +
//     "Manage Subscription" button (Stripe billing portal).
// ============================================================

interface UpgradeTabProps {
  /** Active pack id from hl_user_packs, or null when on base Pro. */
  activePackId: string | null;
  /** Whether the user has a live Stripe subscription we can manage. */
  hasSubscription: boolean;
}

export function UpgradeTab({ activePackId, hasSubscription }: UpgradeTabProps) {
  const toast = useHlToast();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [managing, setManaging] = useState(false);

  const activePack = activePackId ? getHyperlocalPackById(activePackId) : null;

  const handleManage = async () => {
    setManaging(true);
    try {
      const res = await fetch("/api/apps/hyperlocal/manage-subscription", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Failed to open subscription portal");
      }
    } catch {
      toast.error("Network error — could not reach server");
    } finally {
      setManaging(false);
    }
  };

  return (
    <div className="space-y-6">
      {hasSubscription && activePack ? (
        <ActivePackPanel
          pack={activePack}
          managing={managing}
          onManage={handleManage}
          onChangePack={() => setShowUpgradeModal(true)}
        />
      ) : (
        <BasePlanPanel onUpgrade={() => setShowUpgradeModal(true)} />
      )}

      <PackLadder
        activePackId={activePackId}
        onSelect={() => setShowUpgradeModal(true)}
      />

      <HyperlocalUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="cta"
      />
    </div>
  );
}

function ActivePackPanel({
  pack,
  managing,
  onManage,
  onChangePack,
}: {
  pack: HyperlocalPack;
  managing: boolean;
  onManage: () => void;
  onChangePack: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white"
              style={{
                background:
                  "linear-gradient(135deg, #E11D48 0%, #7C3AED 100%)",
              }}
            >
              <Zap className="h-3 w-3" />
              {pack.tier}
            </span>
            <span className="text-sm text-muted-foreground">
              ${(pack.priceCents / 100).toFixed(0)}/mo
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {pack.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onChangePack}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors"
          >
            Change pack
          </button>
          <button
            onClick={onManage}
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border">
        <Meter label="Campaigns / mo" value={formatPackLimit(pack.campaignsPerMonth)} />
        <Meter label="Segments" value={formatPackLimit(pack.segmentsPerCampaign)} />
        <Meter
          label="MLS history"
          value={
            pack.mlsHistoryMonths === UNLIMITED
              ? "Unlimited"
              : `${pack.mlsHistoryMonths} mo`
          }
        />
        <Meter label="AI edits" value={formatPackLimit(pack.aiChatEditsPerDraft)} />
      </div>
    </div>
  );
}

function BasePlanPanel({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-muted text-foreground">
              Pro (included)
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Hyperlocal is included with your AiM Pro membership at base allowances.
            Add a Hyperlocal pack for more monthly campaigns, larger segments,
            deeper MLS history, and more AI edits per draft.
          </p>
        </div>
        <button
          onClick={onUpgrade}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #E11D48 0%, #7C3AED 100%)",
          }}
        >
          <Zap className="h-3.5 w-3.5" />
          See packs
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border">
        <Meter
          label="Campaigns / mo"
          value={formatPackLimit(HYPERLOCAL_BASE.campaignsPerMonth)}
        />
        <Meter
          label="Segments"
          value={formatPackLimit(HYPERLOCAL_BASE.segmentsPerCampaign)}
        />
        <Meter
          label="MLS history"
          value={
            HYPERLOCAL_BASE.mlsHistoryMonths === UNLIMITED
              ? "Unlimited"
              : `${HYPERLOCAL_BASE.mlsHistoryMonths} mo`
          }
        />
        <Meter
          label="AI edits"
          value={formatPackLimit(HYPERLOCAL_BASE.aiChatEditsPerDraft)}
        />
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className="text-lg font-semibold text-foreground mt-0.5">{value}</div>
    </div>
  );
}

function PackLadder({
  activePackId,
  onSelect,
}: {
  activePackId: string | null;
  onSelect: () => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">All packs</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {HYPERLOCAL_PACKS.map((pack) => {
          const isActive = activePackId === pack.id;
          return (
            <button
              key={pack.id}
              type="button"
              onClick={onSelect}
              className={cn(
                "text-left rounded-lg border p-4 transition-colors",
                isActive
                  ? "border-[#E11D48] bg-[#E11D48]/5"
                  : pack.bestValue
                    ? "border-[#E11D48]/40 hover:border-[#E11D48]"
                    : "border-border hover:border-[#E11D48]/50",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">
                  {pack.tier}
                </span>
                {isActive ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#E11D48]">
                    <Check className="h-3 w-3" />
                    Current
                  </span>
                ) : pack.bestValue ? (
                  <span className="text-[10px] font-medium text-[#E11D48]">
                    Best value
                  </span>
                ) : null}
              </div>
              <div className="text-xl font-semibold text-foreground">
                ${(pack.priceCents / 100).toFixed(0)}
                <span className="text-xs font-normal text-muted-foreground">
                  /mo
                </span>
              </div>
              <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                <div>
                  <span className="text-foreground font-medium">
                    {formatPackLimit(pack.campaignsPerMonth)}
                  </span>{" "}
                  campaigns
                </div>
                <div>
                  <span className="text-foreground font-medium">
                    {formatPackLimit(pack.segmentsPerCampaign)}
                  </span>{" "}
                  segments
                </div>
                <div>
                  <span className="text-foreground font-medium">
                    {pack.mlsHistoryMonths === UNLIMITED
                      ? "Unlimited"
                      : `${pack.mlsHistoryMonths} mo`}
                  </span>{" "}
                  MLS history
                </div>
                <div>
                  <span className="text-foreground font-medium">
                    {formatPackLimit(pack.aiChatEditsPerDraft)}
                  </span>{" "}
                  AI edits
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
