import { Eye, Globe, MessageSquare, Sparkles, TrendingUp, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

// Sanitized public-facing Radar report. Rendered by /r/[token].
//
// Intentionally no internal nav, no auth-side UI, no account info.
// Just the brand, the KPIs, the leaderboard, the cited-sources, a
// modest "shared via AiM Radar" footer.

interface PublicResponse {
  status:
    | "ready"
    | "not_found"
    | "expired"
    | "revoked"
    | "no_data"
    | "otterly_error";
  brand?: string;
  brandDomain?: string;
  label?: string | null;
  stats?: {
    totalMentions: number;
    averageRank: number | null;
    brandCoverage: number;
    citationRate: number;
    shareOfVoice: number;
    competitors: Array<{
      brand: string;
      isMainBrand: boolean;
      mentions: number;
      shareOfVoice: number;
      rank: number | null;
    }>;
    detectedBrands: Array<{ name: string; mentions: number }>;
    topCitedDomains: Array<{ domain: string; coverage: number }>;
  };
  error?: { message: string; status: number };
}

export function PublicRadarReport({ data }: { data: PublicResponse }) {
  if (data.status !== "ready" || !data.stats) {
    return <GatedView status={data.status} />;
  }

  const { brand, brandDomain, label, stats } = data;
  const mainBrand =
    stats.competitors.find((c) => c.isMainBrand) ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-5xl mx-auto px-4 py-10 space-y-8">
        <header>
          {label && (
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {label}
            </div>
          )}
          <h1 className="text-3xl font-bold">{brand}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI visibility report · {brandDomain} · last 30 days
          </p>
        </header>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <PublicKpi
            label="Share of Voice"
            value={`${stats.shareOfVoice}%`}
            Icon={TrendingUp}
            accent="text-emerald-500"
          />
          <PublicKpi
            label="Brand Coverage"
            value={`${stats.brandCoverage}%`}
            Icon={Eye}
            accent="text-sky-500"
          />
          <PublicKpi
            label="Average Rank"
            value={stats.averageRank != null ? `#${stats.averageRank}` : "—"}
            Icon={Trophy}
            accent="text-amber-500"
          />
          <PublicKpi
            label="Total Mentions"
            value={stats.totalMentions.toLocaleString()}
            Icon={MessageSquare}
            accent="text-violet-500"
          />
          <PublicKpi
            label="Citation Rate"
            value={`${stats.citationRate}%`}
            Icon={Globe}
            accent="text-emerald-500"
          />
        </div>

        {/* Competitor table */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              You vs. configured competitors
            </h2>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="font-medium py-2 pl-5">Brand</th>
                <th className="font-medium py-2 text-right">Mentions</th>
                <th className="font-medium py-2 text-right">SoV</th>
                <th className="font-medium py-2 text-right pr-5">Rank</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.competitors.map((c) => (
                <tr
                  key={c.brand}
                  className={cn(
                    c.isMainBrand && "bg-emerald-500/5 font-medium",
                  )}
                >
                  <td className="py-2 pl-5">
                    {c.brand}
                    {c.isMainBrand && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        you
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{c.mentions}</td>
                  <td className="py-2 text-right tabular-nums">
                    {c.shareOfVoice}%
                  </td>
                  <td className="py-2 text-right tabular-nums pr-5">
                    {c.rank != null ? `#${c.rank}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Detected brand landscape */}
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <header className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Detected brand landscape
              </h2>
            </header>
            <ul className="divide-y divide-border">
              {stats.detectedBrands.map((b) => {
                const max = stats.detectedBrands[0]?.mentions ?? 1;
                return (
                  <li key={b.name} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm truncate">{b.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {b.mentions} mention{b.mentions === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60"
                        style={{ width: `${(b.mentions / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Top cited sources */}
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <header className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4 text-sky-500" />
                Top cited sources
              </h2>
            </header>
            <ul className="divide-y divide-border">
              {stats.topCitedDomains.map((d) => (
                <li
                  key={d.domain}
                  className="px-5 py-2.5 flex items-center justify-between gap-3"
                >
                  <span className="text-sm truncate">{d.domain}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {d.coverage}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground pt-6 border-t border-border">
          Shared via{" "}
          <a
            href="https://apps.aimarketingacademy.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground hover:text-primary"
          >
            AiM Radar
          </a>
          {" · "}
          AI search visibility tracking for real-estate professionals.
        </footer>
      </div>
    </div>
  );
}

function PublicKpi({
  label,
  value,
  Icon,
  accent,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </span>
        <Icon className={cn("h-4 w-4", accent)} />
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", accent)}>
        {value}
      </div>
    </div>
  );
}

function GatedView({ status }: { status: PublicResponse["status"] }) {
  const copy = {
    not_found: {
      title: "Link not found",
      body: "This share link doesn't exist or has been deleted.",
    },
    revoked: {
      title: "Link revoked",
      body: "The owner has disabled this share link.",
    },
    expired: {
      title: "Link expired",
      body: "This share link is past its expiration date.",
    },
    no_data: {
      title: "No data available",
      body: "Tracking hasn't populated yet for this brand.",
    },
    otterly_error: {
      title: "Temporarily unavailable",
      body: "Couldn't load this report right now. Please try again in a moment.",
    },
    ready: { title: "", body: "" },
  };
  const c = copy[status];
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="text-sm text-muted-foreground mt-2">{c.body}</p>
      </div>
    </div>
  );
}
