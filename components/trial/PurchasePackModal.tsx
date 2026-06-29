"use client";

import { useState } from "react";
import { X, Package, CheckCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PROMPT_PACKS, type PromptPack } from "@/lib/prompt-packs";
import { cn } from "@/lib/utils";

interface PurchasePackModalProps {
  open: boolean;
  onClose: () => void;
}

function PackSelection({
  packs,
  selected,
  onSelect,
}: {
  packs: PromptPack[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {packs.map((pack) => (
        <button
          key={pack.id}
          type="button"
          onClick={() => onSelect(pack.id)}
          className={cn(
            "relative flex items-center justify-between rounded-xl border-2 p-4 text-left transition-colors",
            pack.bestValue && !selected
              ? "border-[#31DBA5] bg-[#31DBA5]/5"
              : selected === pack.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
          )}
        >
          {pack.bestValue && (
            <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)" }}>
              Best Value
            </span>
          )}
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">
                {pack.tier} <span className="text-muted-foreground font-normal">— {pack.label}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                ${(pack.priceCents / 100).toFixed(2)}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function PurchasePackModal({ open, onClose }: PurchasePackModalProps) {
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { addToast } = useToast();

  if (!open) return null;

  const handleSelectPack = (packId: string) => {
    setSelectedPack(packId);
  };

  const handleCheckout = async () => {
    if (!selectedPack) return;
    setIsRedirecting(true);

    try {
      const res = await fetch("/api/apps/prompt-studio/purchase-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: selectedPack }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to initiate checkout",
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
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative w-full max-w-md rounded-2xl border bg-background shadow-2xl overflow-hidden pointer-events-auto">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="px-6 pt-6 pb-4">
            <h2 className="text-lg font-bold text-foreground">
              Get More Prompts
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select a prompt pack to continue using Prompt Studio.
            </p>
          </div>

          <div className="px-6 pb-4">
            <PackSelection
              packs={PROMPT_PACKS}
              selected={selectedPack}
              onSelect={handleSelectPack}
            />
          </div>

          {/* Credits info */}
          <div className="px-6 pb-4">
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <Shield className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Bonus credits <span className="font-medium text-foreground">never expire</span> and roll over each month. They&apos;re used automatically after your monthly prompts run out.
              </p>
            </div>
          </div>

          <div className="px-6 pb-6">
            <Button
              className="w-full"
              disabled={!selectedPack || isRedirecting}
              onClick={handleCheckout}
            >
              {isRedirecting ? "Redirecting to checkout..." : "Continue to Checkout"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
