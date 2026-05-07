"use client";

import { useState } from "react";
import { X, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BLOG_PACKS, type BlogPack } from "@/lib/blog-packs";
import { cn } from "@/lib/utils";

interface BlogUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: "limit" | "cta";
  weekEnd?: string;
  currentUsage?: { blogsGenerated: number; blogsLimit: number };
}

function TierCard({
  pack,
  selected,
  onSelect,
}: {
  pack: BlogPack;
  selected: boolean;
  onSelect: () => void;
}) {
  const monthlyCost = (pack.priceCents / 100).toFixed(0);
  const weeklyCost = (pack.priceCents / 100 / 4).toFixed(0);
  const perBlogCost = (pack.priceCents / 100 / (pack.frequency * 4)).toFixed(2);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex items-center justify-between rounded-xl border-2 p-4 text-left transition-colors",
        pack.bestValue && !selected
          ? "border-[#31DBA5] bg-[#31DBA5]/5"
          : selected
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
      )}
    >
      {pack.bestValue && (
        <span
          className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
          style={{
            background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
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
            ${monthlyCost}/mo · ~${perBlogCost}/blog
          </p>
        </div>
      </div>
    </button>
  );
}

export function BlogUpgradeModal({
  open,
  onClose,
  reason = "cta",
  weekEnd,
  currentUsage,
}: BlogUpgradeModalProps) {
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { addToast } = useToast();

  if (!open) return null;

  const resetFormatted = weekEnd
    ? new Date(weekEnd).toLocaleDateString([], {
        month: "long",
        day: "numeric",
      })
    : null;

  const handleCheckout = async () => {
    if (!selectedPack) return;
    setIsRedirecting(true);

    try {
      const res = await fetch("/api/apps/blog-engine/subscribe", {
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
                "linear-gradient(135deg, rgba(28,76,138,0.08) 0%, rgba(49,219,165,0.08) 100%)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{
                background:
                  "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
              }}
            >
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            {reason === "limit" ? (
              <>
                <h2 className="text-lg font-bold text-foreground">
                  Weekly limit reached
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  You&apos;ve used all{" "}
                  {currentUsage
                    ? `${currentUsage.blogsLimit} blogs`
                    : "your blogs"}{" "}
                  this week.
                  {resetFormatted
                    ? ` Your limit resets on ${resetFormatted}.`
                    : ""}{" "}
                  Upgrade for a higher weekly frequency.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-foreground">
                  Generate more blogs
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Upgrade your Blog Engine frequency to publish more
                  SEO-optimized blogs every week.
                </p>
              </>
            )}
          </div>

          {/* Tier selector */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Choose your plan
            </p>
            <div className="grid gap-3">
              {BLOG_PACKS.map((pack) => (
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
              All plans include 3 blogs/week free. Subscriptions are monthly and
              can be cancelled anytime from Settings.
            </p>
          </div>

          {/* CTA */}
          <div className="px-6 pb-6">
            <Button
              className="w-full"
              disabled={!selectedPack || isRedirecting}
              onClick={handleCheckout}
            >
              {isRedirecting
                ? "Redirecting to checkout..."
                : "Subscribe"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
