"use client";

import { PenSquare, Sparkles, TrendingDown, Trophy } from "lucide-react";
import Link from "next/link";

import { FEATURES } from "@/lib/feature-flags";
import type { PromptInsight } from "./types";

// Three side-by-side cards rendered as a grid in OptimizeClient:
//   Wins        — prompts where you rank #1-3
//   Quick wins  — prompts where you're close OR missing-with-volume
//   Gaps        — prompts a competitor wins and you're absent

export function WinsSection({ wins }: { wins: PromptInsight[] }) {
  return (
    <InsightCard
      icon={<Trophy className="h-4 w-4 text-emerald-400" />}
      title={`Your wins (${wins.length})`}
      subtitle="Prompts where you're ranking #1-#3."
      empty="No top-3 wins yet — keep building topical authority."
    >
      <ul className="space-y-2">
        {wins.slice(0, 10).map((p) => (
          <li key={p.id} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] tabular-nums text-emerald-500 bg-emerald-500/15 px-1.5 py-0.5 rounded shrink-0">
                #{p.brandRank}
              </span>
              <span className="text-foreground line-clamp-2">{p.prompt}</span>
            </div>
          </li>
        ))}
      </ul>
    </InsightCard>
  );
}

export function QuickWinsSection({
  quickWins,
}: {
  quickWins: PromptInsight[];
}) {
  return (
    <InsightCard
      icon={<Sparkles className="h-4 w-4 text-amber-400" />}
      title={`Quick wins (${quickWins.length})`}
      subtitle="Close to ranking — push more content here."
      empty="No quick wins flagged. Either you're crushing it or there's no intent volume yet."
    >
      <ul className="space-y-2">
        {quickWins.slice(0, 10).map((p) => (
          <li key={p.id} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] tabular-nums text-amber-500 bg-amber-500/15 px-1.5 py-0.5 rounded shrink-0">
                {p.brandRank != null ? `#${p.brandRank}` : "miss"}
              </span>
              <span className="text-foreground line-clamp-2 flex-1">
                {p.prompt}
              </span>
              <WriteAboutThisLink prompt={p.prompt} />
            </div>
            {p.intentVolume > 0 && (
              <div className="text-[10px] text-muted-foreground mt-0.5 ml-9">
                ~{p.intentVolume.toLocaleString()}/mo searches
              </div>
            )}
          </li>
        ))}
      </ul>
    </InsightCard>
  );
}

export function GapsSection({ gaps }: { gaps: PromptInsight[] }) {
  return (
    <InsightCard
      icon={<TrendingDown className="h-4 w-4 text-rose-400" />}
      title={`Gaps (${gaps.length})`}
      subtitle="Competitors winning, you're absent. Study what they're doing."
      empty="No competitive gaps flagged — you're showing up everywhere."
    >
      <ul className="space-y-2">
        {gaps.slice(0, 10).map((p) => (
          <li key={p.id} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] tabular-nums text-rose-500 bg-rose-500/15 px-1.5 py-0.5 rounded shrink-0">
                miss
              </span>
              <span className="text-foreground line-clamp-2 flex-1">
                {p.prompt}
              </span>
              <WriteAboutThisLink prompt={p.prompt} />
            </div>
            {p.topCompetitor && (
              <div className="text-[10px] text-muted-foreground mt-0.5 ml-9">
                {p.topCompetitor} winning at #{p.topCompetitorRank}
              </div>
            )}
          </li>
        ))}
      </ul>
    </InsightCard>
  );
}

// Cross-app deep link: if the customer has Blog Engine, surface a
// "Write about this" CTA next to each prompt. Routes to the Topic
// Bank with the prompt pre-loaded as a suggestion (banner appears
// on landing). The platform-moat play — Radar identifies, Blog
// Engine acts.
function WriteAboutThisLink({ prompt }: { prompt: string }) {
  if (!FEATURES.BLOG_ENGINE) return null;
  const href = `/apps/blog-engine/topics?suggest=${encodeURIComponent(prompt)}`;
  return (
    <Link
      href={href}
      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
      title="Write a blog post about this with Blog Engine"
    >
      <PenSquare className="h-3.5 w-3.5" />
    </Link>
  );
}

function InsightCard({
  icon,
  title,
  subtitle,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </header>
      <div className="p-4 flex-1">
        {Array.isArray(
          (children as React.ReactElement<{ children?: unknown[] }>)?.props
            ?.children,
        ) &&
        ((
          children as React.ReactElement<{ children?: unknown[] }>
        ).props.children?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground italic">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
