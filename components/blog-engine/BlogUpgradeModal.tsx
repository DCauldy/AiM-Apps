"use client";

import { Sparkles } from "lucide-react";

import { PlanUpgradeDialog } from "@/components/app-shell/PlanUpgradeDialog";
import { BLOG_PACKS, type BlogPack } from "@/lib/blog-packs";

interface BlogUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: "limit" | "cta";
  weekEnd?: string;
  currentUsage?: { blogsGenerated: number; blogsLimit: number };
}

export function BlogUpgradeModal({
  open,
  onClose,
  reason = "cta",
  weekEnd,
  currentUsage,
}: BlogUpgradeModalProps) {
  const resetFormatted = weekEnd
    ? new Date(weekEnd).toLocaleDateString([], {
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <PlanUpgradeDialog
      open={open}
      onClose={onClose}
      plans={BLOG_PACKS}
      subscribeEndpoint="/api/apps/blog-engine/subscribe"
      headerIcon={<Sparkles className="h-5 w-5 text-white" />}
      headerTitle={reason === "limit" ? "Weekly limit reached" : "Generate more blogs"}
      headerDescription={
        reason === "limit" ? (
          <>
            You&apos;ve used all{" "}
            {currentUsage ? `${currentUsage.blogsLimit} blogs` : "your blogs"}{" "}
            this week.
            {resetFormatted ? ` Your limit resets on ${resetFormatted}.` : ""}{" "}
            Upgrade for a higher weekly frequency.
          </>
        ) : (
          <>
            Upgrade your Blog Engine frequency to publish more SEO-optimized
            blogs every week.
          </>
        )
      }
      headerGradient="linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)"
      headerBackground="linear-gradient(135deg, rgba(28,76,138,0.08) 0%, rgba(49,219,165,0.08) 100%)"
      bestValueGradient="linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)"
      bestValueClassName="border-[#31DBA5] bg-[#31DBA5]/5"
      selectedClassName="border-primary bg-primary/5"
      hoverClassName="border-border hover:border-primary/50"
      planMeta={(pack: BlogPack) => {
        const monthlyCost = (pack.priceCents / 100).toFixed(0);
        const perBlogCost = (pack.priceCents / 100 / (pack.frequency * 4)).toFixed(2);
        return `$${monthlyCost}/mo · ~$${perBlogCost}/blog`;
      }}
      infoText="All plans include 3 blogs/week free. Subscriptions are monthly and can be cancelled anytime from Settings."
    />
  );
}
