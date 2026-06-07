"use client";

import { useEffect, useState } from "react";
import { Building2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface SlotPrice {
  amountCents: number;
  currency: string;
  interval: string;
  intervalCount: number;
}

interface SlotUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional reason — when triggered from the locked New Profile button, surfaces the slot context. */
  reason?: "limit" | "cta";
  currentUsage?: { activeCount: number; slotCount: number };
}

/**
 * Slot upgrade modal — visual sibling to BlogUpgradeModal / PlanUpgradeDialog.
 * Single plan (one additional Profile Slot, annual). Resolves the price from
 * /api/profiles/slots/price at mount, then a single CTA kicks off Stripe
 * Checkout via /api/profiles/slots/checkout.
 */
export function SlotUpgradeModal({
  open,
  onClose,
  reason = "cta",
  currentUsage,
}: SlotUpgradeModalProps) {
  const { addToast } = useToast();
  const [price, setPrice] = useState<SlotPrice | null>(null);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!open || price) return;
    setLoading(true);
    fetch("/api/profiles/slots/price")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Price not available");
        return r.json() as Promise<SlotPrice>;
      })
      .then((data) => setPrice(data))
      .catch((err) => {
        addToast({
          title: "Could not load slot price",
          description: err instanceof Error ? err.message : "Try again shortly.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [open, price, addToast]);

  if (!open) return null;

  const amount = price ? (price.amountCents / 100).toFixed(0) : "—";
  const intervalLabel = price?.interval === "year" ? "year" : price?.interval ?? "year";

  async function handleCheckout() {
    setRedirecting(true);
    try {
      const res = await fetch("/api/profiles/slots/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not start checkout");
      window.location.href = data.url;
    } catch (err) {
      addToast({
        title: "Could not start checkout",
        description: err instanceof Error ? err.message : "Try again shortly.",
        variant: "destructive",
      });
      setRedirecting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative w-full max-w-md rounded-2xl glass-modal text-white overflow-hidden pointer-events-auto">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>

          <div
            className="px-6 pt-6 pb-5"
            style={{
              background: "linear-gradient(135deg, rgba(28,76,138,0.08) 0%, rgba(49,219,165,0.08) 100%)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{ background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)" }}
            >
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {reason === "limit" ? "You are at your Profile limit" : "Add another Profile"}
            </h2>
            <div className="text-sm text-muted-foreground mt-1">
              {reason === "limit" && currentUsage ? (
                <>
                  You have {currentUsage.activeCount} of {currentUsage.slotCount} Profiles in
                  use. Add another Profile to run a second company identity.
                </>
              ) : (
                <>One Profile per company identity. Apps run independently under each.</>
              )}
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="rounded-lg border border-[#31DBA5] bg-[#31DBA5]/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">+1 Profile</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {loading
                      ? "Loading price…"
                      : price
                        ? `$${amount}/${intervalLabel}, billed annually`
                        : "Price unavailable"}
                  </p>
                </div>
                <Check className="h-4 w-4 text-[#31DBA5] shrink-0 mt-1" />
              </div>
              <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="h-3 w-3 text-[#31DBA5] mt-0.5 shrink-0" />
                  Switch between identities from any AiM Automations app.
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3 w-3 text-[#31DBA5] mt-0.5 shrink-0" />
                  Each profile gets its own quota for prompts, blogs, sends, queries.
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3 w-3 text-[#31DBA5] mt-0.5 shrink-0" />
                  Archive or delete a Profile any time and replace it at no charge.
                </li>
              </ul>
            </div>
          </div>

          <div className="px-6 pb-4">
            <p className="text-xs text-muted-foreground">
              Annual subscription. Cancel any time — your Profile stays active through the end
              of the billing period.
            </p>
          </div>

          <div className="px-6 pb-6">
            <Button
              className="w-full"
              disabled={!price || redirecting}
              onClick={handleCheckout}
            >
              {redirecting ? "Redirecting to checkout…" : "Add a Profile"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
