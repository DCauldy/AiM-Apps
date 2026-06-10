"use client";

import { useState } from "react";
import { Loader2, ExternalLink, Zap, Check, Users } from "lucide-react";

import { ListingStudioUpgradeModal } from "@/components/listing-studio/ListingStudioUpgradeModal";
import { useToast } from "@/components/ui/toast";
import {
  LISTING_STUDIO_PACKS,
  LISTING_STUDIO_BASE,
  UNLIMITED,
  getListingStudioPackById,
  type ListingStudioPack,
  type PackLimit,
} from "@/lib/listing-studio-packs";
import { cn } from "@/lib/utils";

interface UpgradeTabProps {
  activePackId: string | null;
  hasSubscription: boolean;
}

export function UpgradeTab({ activePackId, hasSubscription }: UpgradeTabProps) {
  const { addToast } = useToast();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [managing, setManaging] = useState(false);

  const activePack = activePackId ? getListingStudioPackById(activePackId) : null;

  const handleManage = async () => {
    setManaging(true);
    try {
      const res = await fetch("/api/apps/listing-studio/manage-subscription", {
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

      <ListingStudioUpgradeModal
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
  pack: ListingStudioPack;
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
                background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
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

      <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-border">
        <Meter label="Active clients" value={formatLimit(pack.activeClientsLimit)} />
        <Meter label="Manual sends / mo" value={formatLimit(pack.manualSendsPerMonth)} />
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
            CMA is included with your AiM Pro membership. Pro covers up to{" "}
            {LISTING_STUDIO_BASE.activeClientsLimit} past clients on the
            automated quarterly cadence. Add a pack to enroll more.
          </p>
        </div>
        <button
          onClick={onUpgrade}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
          }}
        >
          <Zap className="h-3.5 w-3.5" />
          See packs
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-border">
        <Meter
          label="Active clients"
          value={formatLimit(LISTING_STUDIO_BASE.activeClientsLimit)}
        />
        <Meter
          label="Manual sends / mo"
          value={formatLimit(LISTING_STUDIO_BASE.manualSendsPerMonth)}
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

function formatLimit(limit: PackLimit): string {
  return limit === UNLIMITED ? "Unlimited" : limit.toLocaleString();
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
        {LISTING_STUDIO_PACKS.map((pack) => {
          const isActive = activePackId === pack.id;
          return (
            <button
              key={pack.id}
              type="button"
              onClick={onSelect}
              className={cn(
                "text-left rounded-lg border p-4 transition-colors",
                isActive
                  ? "border-[#D4A35C] bg-[#D4A35C]/5"
                  : pack.bestValue
                    ? "border-[#D4A35C]/40 hover:border-[#D4A35C]"
                    : "border-border hover:border-[#D4A35C]/50",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">
                  {pack.tier}
                </span>
                {isActive ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#D4A35C]">
                    <Check className="h-3 w-3" />
                    Current
                  </span>
                ) : pack.bestValue ? (
                  <span className="text-[10px] font-medium text-[#D4A35C]">
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
                  <Users className="inline h-3 w-3 mr-1" />
                  <span className="text-foreground font-medium">
                    {formatLimit(pack.activeClientsLimit)}
                  </span>{" "}
                  active clients
                </div>
                <div>
                  <span className="text-foreground font-medium">
                    {formatLimit(pack.manualSendsPerMonth)}
                  </span>{" "}
                  manual sends / mo
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
