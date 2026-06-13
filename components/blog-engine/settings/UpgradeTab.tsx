"use client";

import { useState } from "react";
import { Loader2, ExternalLink, Zap, Check, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import { BlogUpgradeModal } from "@/components/blog-engine/BlogUpgradeModal";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { BLOG_PACKS, getUserTierLabel } from "@/lib/blog-packs";
import { cn } from "@/lib/utils";

// ============================================================
// Blog Engine Settings → Upgrade tab.
//
// Mirrors the Hyperlocal Upgrade tab shape so the two apps feel
// consistent: current tier card + pack ladder + "Manage Subscription"
// button when a Stripe subscription is live, otherwise an "upgrade"
// CTA that opens BlogUpgradeModal.
//
// The "Reset & re-run onboarding" affordance also lives here — it
// only makes sense in the lifecycle/subscription part of Settings.
// ============================================================

interface UpgradeTabProps {
  frequency: number;
  hasSubscription: boolean;
}

export function UpgradeTab({ frequency, hasSubscription }: UpgradeTabProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [managing, setManaging] = useState(false);

  const handleManage = async () => {
    setManaging(true);
    try {
      const res = await fetch("/api/apps/blog-engine/manage-subscription", {
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

  const handleReset = async () => {
    const ok = await confirm({
      title: "Restart onboarding?",
      description:
        "This will clear your profile and restart the onboarding process.",
      confirmLabel: "Restart",
      variant: "destructive",
    });
    if (ok) router.push("/apps/blog-engine/onboarding");
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
                      "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
                  }}
                >
                  <Zap className="h-3 w-3" />
                  {getUserTierLabel(frequency)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {frequency}× per week
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
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-muted text-foreground">
                  Pro (included)
                </span>
                <span className="text-sm text-muted-foreground">
                  3× per week
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Blog Engine is included with your AiM Pro membership at 3 blogs
                per week. Upgrade to publish up to 7 per week.
              </p>
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white transition-opacity hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
              }}
            >
              <Zap className="h-3.5 w-3.5" />
              See packs
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">All packs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BLOG_PACKS.map((pack) => {
            const isCurrent = hasSubscription && frequency === pack.frequency;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className={cn(
                  "text-left rounded-lg border p-4 transition-colors",
                  isCurrent
                    ? "border-[#31DBA5] bg-[#31DBA5]/5"
                    : "border-border hover:border-[#1C4C8A]/50",
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">
                    {pack.label}
                  </span>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#31DBA5]">
                      <Check className="h-3 w-3" />
                      Current
                    </span>
                  )}
                </div>
                <div className="text-xl font-semibold text-foreground">
                  ${(pack.priceCents / 100).toFixed(0)}
                  <span className="text-xs font-normal text-muted-foreground">
                    /mo
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  <span className="text-foreground font-medium">
                    {pack.frequency}
                  </span>{" "}
                  blogs per week
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t pt-6">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/5 rounded-lg transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Reset & re-run onboarding
        </button>
        <p className="text-xs text-muted-foreground mt-1 ml-10">
          Clears your Blog Engine profile and restarts the onboarding chat.
        </p>
      </div>

      <BlogUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="cta"
      />
    </div>
  );
}
