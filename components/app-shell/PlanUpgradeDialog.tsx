"use client";

import { useState, type ReactNode } from "react";
import { X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type PlanUpgradeDialogPlan = {
  id: string;
  tier: string;
  label: string;
  priceCents: number;
  bestValue?: boolean;
};

type PlanUpgradeDialogProps<TPlan extends PlanUpgradeDialogPlan> = {
  open: boolean;
  onClose: () => void;
  plans: TPlan[];
  subscribeEndpoint: string;
  headerIcon: ReactNode;
  headerTitle: string;
  headerDescription: ReactNode;
  headerGradient: string;
  headerBackground: string;
  bestValueGradient: string;
  bestValueClassName: string;
  selectedClassName: string;
  hoverClassName: string;
  planMeta: (plan: TPlan) => ReactNode;
  infoText: ReactNode;
  ctaClassName?: string;
};

export function PlanUpgradeDialog<TPlan extends PlanUpgradeDialogPlan>({
  open,
  onClose,
  plans,
  subscribeEndpoint,
  headerIcon,
  headerTitle,
  headerDescription,
  headerGradient,
  headerBackground,
  bestValueGradient,
  bestValueClassName,
  selectedClassName,
  hoverClassName,
  planMeta,
  infoText,
  ctaClassName,
}: PlanUpgradeDialogProps<TPlan>) {
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { addToast } = useToast();

  if (!open) return null;

  const handleCheckout = async () => {
    if (!selectedPack) return;
    setIsRedirecting(true);

    try {
      const res = await fetch(subscribeEndpoint, {
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
        <div className="relative w-full max-w-md rounded-2xl glass-modal text-white overflow-hidden pointer-events-auto">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="px-6 pt-6 pb-5" style={{ background: headerBackground }}>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{ background: headerGradient }}
            >
              {headerIcon}
            </div>
            <h2 className="text-lg font-bold text-foreground">{headerTitle}</h2>
            <div className="text-sm text-muted-foreground mt-1">
              {headerDescription}
            </div>
          </div>

          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Choose your plan
            </p>
            <div className="grid gap-3">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={selectedPack === plan.id}
                  onSelect={() => setSelectedPack(plan.id)}
                  bestValueGradient={bestValueGradient}
                  bestValueClassName={bestValueClassName}
                  selectedClassName={selectedClassName}
                  hoverClassName={hoverClassName}
                  planMeta={planMeta}
                />
              ))}
            </div>
          </div>

          <div className="px-6 pb-4">
            <p className="text-xs text-muted-foreground">{infoText}</p>
          </div>

          <div className="px-6 pb-6">
            <Button
              className={cn("w-full", ctaClassName)}
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

function PlanCard<TPlan extends PlanUpgradeDialogPlan>({
  plan,
  selected,
  onSelect,
  bestValueGradient,
  bestValueClassName,
  selectedClassName,
  hoverClassName,
  planMeta,
}: {
  plan: TPlan;
  selected: boolean;
  onSelect: () => void;
  bestValueGradient: string;
  bestValueClassName: string;
  selectedClassName: string;
  hoverClassName: string;
  planMeta: (plan: TPlan) => ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex items-center justify-between rounded-xl border-2 p-4 text-left transition-colors",
        plan.bestValue && !selected
          ? bestValueClassName
          : selected
            ? selectedClassName
            : hoverClassName
      )}
    >
      {plan.bestValue && (
        <span
          className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: bestValueGradient }}
        >
          Best Value
        </span>
      )}
      <div className="flex items-center gap-3">
        <Zap className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-medium">
            {plan.tier}{" "}
            <span className="text-muted-foreground font-normal">
              — {plan.label}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{planMeta(plan)}</p>
        </div>
      </div>
    </button>
  );
}
