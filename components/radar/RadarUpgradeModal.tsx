"use client";

import { useState } from "react";
import { X, Radar, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { RADAR_PACKS, type RadarPack } from "@/lib/radar-packs";
import { cn } from "@/lib/utils";

interface RadarUpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

function TierCard({
  pack,
  selected,
  onSelect,
}: {
  pack: RadarPack;
  selected: boolean;
  onSelect: () => void;
}) {
  const monthlyCost = (pack.priceCents / 100).toFixed(0);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex items-center justify-between rounded-xl border-2 p-4 text-left transition-colors",
        pack.bestValue && !selected
          ? "border-[#e0a458] bg-[#e0a458]/5"
          : selected
            ? "border-[#e0a458] bg-[#e0a458]/10"
            : "border-border hover:border-[#e0a458]/50"
      )}
    >
      {pack.bestValue && (
        <span
          className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
          style={{
            background: "linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)",
          }}
        >
          Best Value
        </span>
      )}
      <div className="flex items-center gap-3">
        <Zap className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-medium">
            {pack.tier}{" "}
            <span className="text-muted-foreground font-normal">
              — {pack.label}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            ${monthlyCost}/mo · {pack.monitoringFrequency} monitoring
          </p>
        </div>
      </div>
    </button>
  );
}

export function RadarUpgradeModal({ open, onClose }: RadarUpgradeModalProps) {
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { addToast } = useToast();

  if (!open) return null;

  const handleCheckout = async () => {
    if (!selectedPack) return;
    setIsRedirecting(true);

    try {
      const res = await fetch("/api/apps/radar/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: selectedPack }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      window.location.href = data.url;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to initiate checkout";
      addToast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      setIsRedirecting(false);
    }
  };

  const handleClose = () => {
    setSelectedPack(null);
    setIsRedirecting(false);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative w-full max-w-md rounded-2xl border bg-background shadow-2xl overflow-hidden pointer-events-auto">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div
            className="px-6 pt-6 pb-5"
            style={{
              background:
                "linear-gradient(135deg, rgba(28,76,138,0.08) 0%, rgba(224,164,88,0.08) 100%)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{
                background: "linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)",
              }}
            >
              <Radar className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              Upgrade Radar
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Track more queries, run manual checks, and monitor weekly
              for deeper AI visibility insights.
            </p>
          </div>

          {/* Tier selector */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Choose your plan
            </p>
            <div className="grid gap-3">
              {RADAR_PACKS.map((pack) => (
                <TierCard
                  key={pack.id}
                  pack={pack}
                  selected={selectedPack === pack.id}
                  onSelect={() => setSelectedPack(pack.id)}
                />
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="px-6 pb-4">
            <p className="text-xs text-muted-foreground">
              Pro includes 25 queries and monthly monitoring. Subscriptions
              are monthly and can be cancelled anytime from Settings.
            </p>
          </div>

          {/* CTA */}
          <div className="px-6 pb-6">
            <Button
              className="w-full bg-[#e0a458] hover:bg-[#c88d3e] text-white"
              disabled={!selectedPack || isRedirecting}
              onClick={handleCheckout}
            >
              {isRedirecting ? "Redirecting to checkout..." : "Subscribe"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
