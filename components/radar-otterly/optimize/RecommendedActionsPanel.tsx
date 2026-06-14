"use client";

import Link from "next/link";
import { ArrowRight, Share2, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { WriteAboutThisLink } from "@/components/radar-otterly/CrossAppActions";
import type { PromptInsight } from "./types";

// Recommended Actions panel — sits at the top of Optimize, above
// Site Health. Surfaces the 2-3 most actionable items lifted out of
// the Wins / Quick Wins / Gaps columns, each paired with an
// explicit call-to-action button. The high-CTR placement of the
// cross-app deep links — same data, way more visible than the
// inline pencil icons in the lower cards.
//
// Hides entirely if nothing actionable surfaced (e.g. brand-new
// brand report, no insights yet) so we don't render an empty box.

interface RecommendedActionsProps {
  wins: PromptInsight[];
  quickWins: PromptInsight[];
  gaps: PromptInsight[];
}

export function RecommendedActionsPanel({
  wins,
  quickWins,
  gaps,
}: RecommendedActionsProps) {
  const topWin = wins[0] ?? null;
  const topQuickWin = quickWins[0] ?? null;
  const topGap = gaps[0] ?? null;

  const items: ActionItem[] = [];

  if (topQuickWin) {
    items.push({
      kind: "quick_win",
      prompt: topQuickWin.prompt,
      headline: "Push to #1",
      detail:
        topQuickWin.brandRank != null
          ? `You're at #${topQuickWin.brandRank} for this — close enough that more content tips the scale.`
          : "You're surfacing but not winning yet — fresh content closes the gap.",
      action: "write",
    });
  }
  if (topGap) {
    items.push({
      kind: "gap",
      prompt: topGap.prompt,
      headline: topGap.topCompetitor
        ? `${topGap.topCompetitor} owns this`
        : "Competitor gap",
      detail: topGap.topCompetitor
        ? `${topGap.topCompetitor} ranks #${topGap.topCompetitorRank} for this. Match or beat them.`
        : "A competitor is winning a query you should be in. Write about it.",
      action: "write",
    });
  }
  if (topWin) {
    items.push({
      kind: "win",
      prompt: topWin.prompt,
      headline: `You're #${topWin.brandRank} for this`,
      detail:
        "Strong win — worth sharing with your broker / team to show the AI traction.",
      action: "share",
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-card to-card overflow-hidden">
      <header className="border-b border-border/50 px-5 py-3 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold">Do this week</h2>
        <span className="text-[11px] text-muted-foreground">
          {items.length} recommended action{items.length === 1 ? "" : "s"}
        </span>
      </header>
      <ul className="divide-y divide-border/50">
        {items.map((item, idx) => (
          <ActionRow key={`${item.kind}-${idx}`} item={item} />
        ))}
      </ul>
    </section>
  );
}

interface ActionItem {
  kind: "win" | "quick_win" | "gap";
  prompt: string;
  headline: string;
  detail: string;
  action: "write" | "share";
}

function ActionRow({ item }: { item: ActionItem }) {
  const kindAccent =
    item.kind === "win"
      ? "text-emerald-500"
      : item.kind === "quick_win"
        ? "text-amber-500"
        : "text-rose-500";
  const kindLabel =
    item.kind === "win"
      ? "Win"
      : item.kind === "quick_win"
        ? "Quick win"
        : "Gap";

  return (
    <li className="px-5 py-4 flex items-start gap-4 flex-wrap sm:flex-nowrap">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              "text-[10px] uppercase tracking-wide font-medium",
              kindAccent,
            )}
          >
            {kindLabel}
          </span>
          <span className="text-sm font-medium text-foreground">
            {item.headline}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {item.detail}
        </p>
        <p className="text-[11px] text-foreground/80 mt-1.5 italic line-clamp-2">
          &ldquo;{item.prompt}&rdquo;
        </p>
      </div>
      <div className="shrink-0 self-center">
        {item.action === "write" ? (
          <WriteAboutThisLink prompt={item.prompt} variant="label" />
        ) : (
          <Link
            href="/apps/radar/settings?tab=share"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border bg-background text-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Share2 className="h-3 w-3" />
            Share with broker
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </li>
  );
}
