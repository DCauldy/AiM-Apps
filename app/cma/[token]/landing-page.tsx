import Image from "next/image";
import {
  MapPin,
  Bed,
  Bath,
  Maximize2,
  Calendar,
  TrendingUp,
  TrendingDown,
  Mail,
  Phone,
  ExternalLink,
} from "lucide-react";

import { listingStudioStaticMapUrl } from "@/lib/listing-studio/mapbox";
import type { AdjustedComp } from "@/types/listing-studio";
import type { CmaClient, CmaClientDelivery } from "@/types/cma";
import type { PlatformProfile } from "@/types/platform-profile";

// ============================================================
// Public landing page — the report a past client opens from email.
//
// Server-rendered, no auth, no client-side state. Everything is
// hand-renderable React because we have no interactivity beyond
// regular hyperlinks. Mobile-first via Tailwind; the layout
// collapses to a single column under sm.
// ============================================================

interface CmaRunData {
  comps: unknown;
  adjustment_grid: unknown;
  appraised_value_cents: number | null;
  marketable_value_cents: number | null;
  recommended_price_cents: number | null;
  seller_narrative_md: string | null;
  pipeline_error: string | null;
  generated_at: string;
}

interface PriorDelivery {
  recommended_price_cents: number | null;
  estimated_value_cents: number | null;
  delivered_at: string | null;
}

export function LandingPage({
  delivery,
  client,
  run,
  agent,
  prior,
  unsubscribeUrl,
  previewMode = false,
}: {
  /** Live delivery row when rendered via /cma/[token]; omitted in
   *  preview mode where there's no real delivery yet. */
  delivery?: CmaClientDelivery | null;
  client: CmaClient;
  run: CmaRunData | null;
  agent: PlatformProfile | null;
  prior: PriorDelivery | null;
  /** Compliance footer link; "#" in preview mode (link disabled). */
  unsubscribeUrl?: string;
  /** When true, render the in-app preview banner + suppress engagement
   *  links so the agent can review without triggering anything. */
  previewMode?: boolean;
}) {
  const recommended =
    delivery?.recommended_price_cents ?? run?.recommended_price_cents ?? null;
  const estimated =
    delivery?.estimated_value_cents ?? run?.appraised_value_cents ?? null;
  const marketable =
    delivery?.marketable_value_cents ?? run?.marketable_value_cents ?? null;

  const comps = (run?.comps as AdjustedComp[] | null) ?? [];

  const facts = client.property_facts ?? {};
  const heroImage = facts.image_url ?? null;
  const heroMap =
    facts.latitude && facts.longitude
      ? listingStudioStaticMapUrl(facts.latitude, facts.longitude, {
          width: 1200,
          height: 420,
        })
      : null;

  const accent = sanitizeHex(agent?.accent_color) ?? "#D4A35C";
  const primary = sanitizeHex(agent?.primary_color) ?? "#1E293B";

  const deltaPrice =
    prior?.recommended_price_cents && recommended
      ? recommended - prior.recommended_price_cents
      : null;
  const deltaPct =
    prior?.recommended_price_cents && recommended
      ? ((recommended - prior.recommended_price_cents) /
          prior.recommended_price_cents) *
        100
      : null;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100">
      {previewMode && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
          <strong>Preview</strong> — this is exactly what your client will see.
          Links are inactive.
        </div>
      )}
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {agent?.logo_url && (
              <Image
                src={agent.logo_url}
                alt=""
                width={120}
                height={36}
                className="h-9 w-auto object-contain"
                unoptimized
              />
            )}
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Quarterly CMA
              </div>
              <div className="text-sm font-medium">
                Prepared for{" "}
                <span style={{ color: accent }}>
                  {clientFullName(client) || "you"}
                </span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400 text-right">
            <div>Report date</div>
            <div className="text-slate-200 font-medium">
              {formatDate(
                delivery?.delivered_at ?? run?.generated_at ?? null,
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <SubjectHero
          heroImage={heroImage}
          heroMap={heroMap}
          address={client.address ?? ""}
          facts={facts}
          accent={accent}
        />

        {/* Recommendation panel */}
        <RecommendationPanel
          recommended={recommended}
          estimated={estimated}
          marketable={marketable}
          deltaPrice={deltaPrice}
          deltaPct={deltaPct}
          priorAt={prior?.delivered_at ?? null}
          accent={accent}
        />

        {/* Narrative */}
        {run?.seller_narrative_md && (
          <Narrative markdown={run.seller_narrative_md} accent={accent} />
        )}

        {/* Comps */}
        {comps.length > 0 && (
          <CompsSection comps={comps} accent={accent} />
        )}

        {/* Pipeline error surface */}
        {run?.pipeline_error && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <strong>Heads up:</strong> a piece of this report didn&apos;t
            generate cleanly. Your agent has been notified. ({run.pipeline_error})
          </div>
        )}

        {/* CTA */}
        <CtaCard agent={agent} accent={accent} primary={primary} />

        {/* Compliance footer */}
        <ComplianceFooter
          agent={agent}
          unsubscribeUrl={unsubscribeUrl ?? "#"}
        />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subject hero
// ---------------------------------------------------------------------------

function SubjectHero({
  heroImage,
  heroMap,
  address,
  facts,
  accent,
}: {
  heroImage: string | null;
  heroMap: string | null;
  address: string;
  facts: CmaClient["property_facts"];
  accent: string;
}) {
  const bg = heroImage ?? heroMap;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      {bg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bg}
          alt={address}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, #1E293B 0%, ${accent} 100%)`,
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/20 to-transparent" />
      <div className="relative px-6 pt-32 pb-6 sm:px-10 sm:pt-44 sm:pb-8">
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider font-semibold backdrop-blur"
          style={{ background: `${accent}33`, color: accent, borderColor: `${accent}55` }}
        >
          <MapPin className="h-3 w-3" />
          Subject property
        </div>
        <h1 className="mt-3 text-2xl sm:text-4xl font-semibold tracking-tight">
          {address}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-slate-200">
          {facts.beds != null && (
            <span className="inline-flex items-center gap-1.5">
              <Bed className="h-4 w-4" /> {facts.beds} bd
            </span>
          )}
          {facts.baths != null && (
            <span className="inline-flex items-center gap-1.5">
              <Bath className="h-4 w-4" /> {facts.baths} ba
            </span>
          )}
          {facts.living_area_sqft != null && (
            <span className="inline-flex items-center gap-1.5">
              <Maximize2 className="h-4 w-4" />{" "}
              {facts.living_area_sqft.toLocaleString()} sqft
            </span>
          )}
          {facts.year_built && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" /> built {facts.year_built}
            </span>
          )}
          {facts.lot_area_sqft && (
            <span className="inline-flex items-center gap-1.5">
              {formatLot(facts.lot_area_sqft)} lot
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recommendation panel
// ---------------------------------------------------------------------------

function RecommendationPanel({
  recommended,
  estimated,
  marketable,
  deltaPrice,
  deltaPct,
  priorAt,
  accent,
}: {
  recommended: number | null;
  estimated: number | null;
  marketable: number | null;
  deltaPrice: number | null;
  deltaPct: number | null;
  priorAt: string | null;
  accent: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
        Recommendation
      </div>
      <div
        className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight"
        style={{ color: accent }}
      >
        {formatDollars(recommended)}
      </div>
      <div className="mt-1 text-sm text-slate-300">Suggested list price</div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Estimated value" value={formatDollars(estimated)} />
        <Tile label="Marketable value" value={formatDollars(marketable)} />
        <DeltaTile
          deltaPrice={deltaPrice}
          deltaPct={deltaPct}
          priorAt={priorAt}
        />
      </div>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

function DeltaTile({
  deltaPrice,
  deltaPct,
  priorAt,
}: {
  deltaPrice: number | null;
  deltaPct: number | null;
  priorAt: string | null;
}) {
  if (deltaPct == null || deltaPrice == null) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          First CMA
        </div>
        <div className="mt-0.5 text-xl font-semibold text-slate-300">
          Baseline
        </div>
      </div>
    );
  }
  const positive = deltaPrice >= 0;
  const Arrow = positive ? TrendingUp : TrendingDown;
  const color = positive ? "text-emerald-400" : "text-rose-400";
  const sign = positive ? "+" : "";
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
        Vs last CMA{priorAt ? ` (${formatDate(priorAt)})` : ""}
      </div>
      <div className={`mt-0.5 flex items-baseline gap-2 text-xl font-semibold ${color}`}>
        <Arrow className="h-4 w-4" />
        {sign}
        {deltaPct.toFixed(1)}%
      </div>
      <div className="text-[11px] text-slate-400">
        {sign}
        {formatDollars(deltaPrice)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Narrative
// ---------------------------------------------------------------------------

function Narrative({ markdown }: { markdown: string; accent: string }) {
  // Lightweight server-side markdown rendering — heading + paragraphs + bullets.
  // We avoid bringing in react-markdown for the public route to keep the JS
  // bundle small. The seller narrative shape is constrained by prompts.ts.
  const blocks = parseSimpleMarkdown(markdown);
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-4">
        The recommendation, explained
      </div>
      <div className="space-y-4">
        {blocks.map((b, i) => {
          if (b.type === "h2") {
            return (
              <h2
                key={i}
                className="mt-6 first:mt-0 text-lg font-semibold tracking-tight text-slate-100"
              >
                {b.text}
              </h2>
            );
          }
          if (b.type === "ul") {
            return (
              <ul key={i} className="list-disc list-outside pl-5 text-sm text-slate-300 space-y-1.5">
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            );
          }
          return (
            <p key={i} className="text-sm text-slate-300 leading-relaxed">
              {b.text}
            </p>
          );
        })}
      </div>
    </section>
  );
}

type Block =
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

function parseSimpleMarkdown(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let bullets: string[] | null = null;
  for (const raw of lines) {
    const line = raw.replace(/^\s+|\s+$/g, "");
    if (line === "") {
      if (bullets) {
        blocks.push({ type: "ul", items: bullets });
        bullets = null;
      }
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("# ")) {
      if (bullets) {
        blocks.push({ type: "ul", items: bullets });
        bullets = null;
      }
      blocks.push({ type: "h2", text: stripFormatting(line.replace(/^#+\s+/, "")) });
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!bullets) bullets = [];
      bullets.push(stripFormatting(line.replace(/^[-*]\s+/, "")));
      continue;
    }
    if (bullets) {
      blocks.push({ type: "ul", items: bullets });
      bullets = null;
    }
    blocks.push({ type: "p", text: stripFormatting(line) });
  }
  if (bullets) blocks.push({ type: "ul", items: bullets });
  return blocks;
}

function stripFormatting(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}

// ---------------------------------------------------------------------------
// Comps section
// ---------------------------------------------------------------------------

function CompsSection({ comps, accent }: { comps: AdjustedComp[]; accent: string }) {
  // Show up to 6 comps — the agent-facing tab shows all, but the
  // landing page is for the client and "6 strong comparables" reads
  // more credibly than "here are 18 comps."
  const shown = comps.slice(0, 6);
  return (
    <section>
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-4">
        How we compared the market
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {shown.map((c, i) => (
          <CompCard key={`${c.address ?? "comp"}-${i}`} comp={c} accent={accent} />
        ))}
      </div>
      {comps.length > shown.length && (
        <p className="mt-3 text-xs text-slate-400">
          Plus {comps.length - shown.length} more in your full agent
          report. Hit reply if you&apos;d like to see them.
        </p>
      )}
    </section>
  );
}

function CompCard({ comp, accent }: { comp: AdjustedComp; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex">
      {comp.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comp.image_url}
          alt={comp.address ?? ""}
          className="w-24 h-auto object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-24 bg-slate-800 flex-shrink-0" />
      )}
      <div className="flex-1 p-3 min-w-0">
        <div className="text-xs font-medium truncate">
          {comp.address ?? "—"}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
          {comp.beds != null && <span>{comp.beds} bd</span>}
          {comp.baths != null && <span>{comp.baths} ba</span>}
          {comp.living_area_sqft != null && (
            <span>{comp.living_area_sqft.toLocaleString()} sqft</span>
          )}
          {comp.sold_date && <span>sold {formatShortDate(comp.sold_date)}</span>}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-sm font-semibold text-slate-300">
            {formatDollars(comp.sold_price_cents)}
          </div>
          <div className="text-[11px] font-medium" style={{ color: accent }}>
            → {formatDollars(comp.adjusted_value_cents)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CTA card
// ---------------------------------------------------------------------------

function CtaCard({
  agent,
  accent,
  primary,
}: {
  agent: PlatformProfile | null;
  accent: string;
  primary: string;
}) {
  const name = agent?.full_name || agent?.display_name || "Your agent";
  return (
    <section
      className="rounded-2xl border p-6 sm:p-8 text-center"
      style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${accent}22 100%)`,
        borderColor: `${accent}40`,
      }}
    >
      {agent?.headshot_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={agent.headshot_url}
          alt=""
          className="mx-auto h-16 w-16 rounded-full object-cover border-2 border-slate-700"
        />
      )}
      <h2 className="mt-3 text-xl sm:text-2xl font-semibold">
        Want to talk through what this means?
      </h2>
      <p className="mt-2 text-sm text-slate-300 max-w-md mx-auto">
        Hit reply to this email, or reach {name} directly. No pressure —
        just a quick conversation about your home and your options.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {agent?.phone && (
          <a
            href={`tel:${agent.phone}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-white text-slate-900 px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Phone className="h-4 w-4" />
            {agent.phone}
          </a>
        )}
        {agent?.reply_to_email && (
          <a
            href={`mailto:${agent.reply_to_email}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <Mail className="h-4 w-4" />
            Email
          </a>
        )}
        {agent?.website_url && (
          <a
            href={agent.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Website
          </a>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Compliance footer
// ---------------------------------------------------------------------------

function ComplianceFooter({
  agent,
  unsubscribeUrl,
}: {
  agent: PlatformProfile | null;
  unsubscribeUrl: string;
}) {
  return (
    <footer className="border-t border-slate-800 pt-6 pb-4 text-[11px] text-slate-400 space-y-2">
      <div className="space-y-1">
        {agent?.license_info ? (
          <div>{agent.license_info}</div>
        ) : agent?.license_number ? (
          <div>Licensed real estate professional {agent.license_number}</div>
        ) : null}
        {agent?.legal_disclaimer && <div>{agent.legal_disclaimer}</div>}
        {agent?.physical_address && <div>{agent.physical_address}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Equal Housing Opportunity</span>
        <span>·</span>
        <a href={unsubscribeUrl} className="underline hover:text-slate-200">
          Unsubscribe
        </a>
      </div>
      <div className="text-slate-600">
        This report is an estimate based on recent comparable sales and is
        not an appraisal or legal valuation.
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientFullName(c: CmaClient): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
}

function formatDollars(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatLot(sqft: number): string {
  if (sqft >= 10000) {
    const acres = sqft / 43560;
    return `${acres.toFixed(2)} ac`;
  }
  return `${sqft.toLocaleString()} sqft`;
}

function sanitizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) return v;
  return null;
}
