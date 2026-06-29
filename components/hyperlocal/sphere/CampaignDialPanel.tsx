"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { SphereZip } from "@/lib/hyperlocal/sphere";

export type DialLens = "seller" | "balanced" | "buyer";
export type DialDepth = "quick" | "full";
export type PropertyType = "all" | "single_family" | "condo" | "townhome";

export interface DialValues {
  lens: DialLens;
  /** min_segment_size — the "big enough for a full report" threshold. */
  reach: number;
  depth: DialDepth;
  /** Data-scope filters — constrain WHICH listings the market analysis pulls,
   *  not which contacts get the email. The whole segment still receives it;
   *  the numbers (and phrasing) reflect this scope. */
  propertyType: PropertyType;
  priceMin: number | null;
  priceMax: number | null;
}

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "single_family", label: "Single Family" },
  { value: "condo", label: "Condo" },
  { value: "townhome", label: "Townhome" },
];

// Price slider scale: 0 → $2M in $25K steps. The top stop means "no ceiling".
const PRICE_MIN = 0;
const PRICE_MAX = 2_000_000;
const PRICE_STEP = 25_000;

function formatPrice(n: number): string {
  if (n >= PRICE_MAX) return "$2M+";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

/** Collapsed-state summary of the data scope (shown next to the toggle). */
function scopeSummary(type: PropertyType, min: number, max: number): string {
  const typeLabel =
    PROPERTY_TYPES.find((t) => t.value === type)?.label ?? "All";
  const allPrice = min <= PRICE_MIN && max >= PRICE_MAX;
  if (type === "all" && allPrice) return "All homes";
  if (allPrice) return typeLabel;
  return `${typeLabel === "All" ? "All" : typeLabel} · ${formatPrice(min)}–${formatPrice(max)}`;
}

export interface CampaignDialPanelProps {
  selectedZips: string[];
  sphereZips: SphereZip[];
  /** The mode chosen at the picker. Magic = auto market data + approve-all;
   *  Control = your MLS upload + full editor. Drives the data depth (the old
   *  Depth dial) and the launch CTA. */
  mode: "magic" | "control";
  /** When set, the panel edits a saved campaign instead of launching: the CTA
   *  becomes "Save changes" and the preview/launch copy is hidden. */
  editing?: boolean;
  /** Launch a run (or save, when editing). */
  onLaunch: (values: DialValues, mode: "magic" | "control") => Promise<void>;
  launching?: boolean;
  /** AI-suggested starting positions (the "pre-set" magic). */
  initial?: Partial<DialValues>;
}

const ANGLE_STOPS: { lens: DialLens; label: string; subject: (n: string) => string }[] = [
  {
    lens: "seller",
    label: "Time to sell",
    subject: (n) => `${n} homes are moving fast 🔥`,
  },
  {
    lens: "balanced",
    label: "Market pulse",
    subject: (n) => `Your ${n} market snapshot`,
  },
  {
    lens: "buyer",
    label: "Thinking of buying?",
    subject: (n) => `New opportunities in ${n}`,
  },
];


export function CampaignDialPanel({
  selectedZips,
  sphereZips,
  mode,
  editing = false,
  onLaunch,
  launching = false,
  initial,
}: CampaignDialPanelProps) {
  const [lens, setLens] = useState<DialLens>(initial?.lens ?? "balanced");
  // Depth is no longer a dial — the mode sets it. Both modes produce a real
  // (full) report: Magic from auto-pulled market data, Control from the
  // agent's MLS upload. Kept in DialValues for the launch contract.
  const depth: DialDepth = "full";
  // Reach (min_segment_size) is no longer user-facing — auto market data means
  // every selected neighborhood gets a full report. Pin it to 1 ("everyone").
  const reach = 1;

  // Data-scope filters.
  const [propertyType, setPropertyType] = useState<PropertyType>(
    initial?.propertyType ?? "all",
  );
  const [priceMin, setPriceMin] = useState<number>(initial?.priceMin ?? PRICE_MIN);
  const [priceMax, setPriceMax] = useState<number>(initial?.priceMax ?? PRICE_MAX);
  // Open by default so the price band + home type are visible without hunting.
  const [scopeOpen, setScopeOpen] = useState(true);

  const selectedSet = useMemo(() => new Set(selectedZips), [selectedZips]);
  const selected = useMemo(
    () => sphereZips.filter((z) => selectedSet.has(z.zip)),
    [sphereZips, selectedSet],
  );

  // The audience is ALWAYS everyone in the selected neighborhoods — a homeowner
  // might sell, buy, or both, so we never filter the list by angle. The angle
  // is the message emphasis; the generator still tailors a seller vs buyer
  // version per recipient. So the count is the union of contacts in the area.
  const recipientCount = useMemo(
    () => selected.reduce((sum, z) => sum + z.contact_count, 0),
    [selected],
  );

  const topName = selected[0]?.zip ?? "your area";
  const sampleSubject =
    ANGLE_STOPS.find((s) => s.lens === lens)?.subject(topName) ?? "";

  const angleIndex = ANGLE_STOPS.findIndex((s) => s.lens === lens);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card p-4">
      {/* Scrollable body — dials + preview. Launch is pinned below so the panel
          bottom lines up with the map even when the dials don't fill it. The
          preview grows to absorb any extra height (no awkward dead space). */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {selectedZips.length} neighborhood
            {selectedZips.length === 1 ? "" : "s"} selected
          </p>
          <p className="text-xs text-muted-foreground">
            Reaching{" "}
            <span className="font-semibold text-foreground">
              {recipientCount.toLocaleString()}
            </span>{" "}
            contact{recipientCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Dial 1 — Angle. A 3-stop slider that sets which perspective LEADS the
          email (every email still carries both a seller and a buyer section —
          this just decides the hero). ANGLE_STOPS is ordered seller→balanced→
          buyer, so the slider index maps straight to the lens. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Angle</span>
          <span className="text-[11px] font-medium text-[#F43F5E]">
            {ANGLE_STOPS[angleIndex].label}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={ANGLE_STOPS.length - 1}
          step={1}
          value={angleIndex}
          onChange={(e) => setLens(ANGLE_STOPS[Number(e.target.value)].lens)}
          className="w-full accent-[#F43F5E]"
          aria-label="Campaign angle"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Seller-focused</span>
          <span>Balanced</span>
          <span>Buyer-focused</span>
        </div>
        <p className="text-xs text-muted-foreground italic truncate">
          “{sampleSubject}”
        </p>
        <p className="text-[11px] text-muted-foreground">
          Everyone in these neighborhoods gets it — this just sets the story we
          lead with.
        </p>
      </div>

      {/* Data scope — constrains the market analysis (price band + home type),
          not the audience. The whole segment still gets the email. */}
      <div className="space-y-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setScopeOpen((o) => !o)}
          className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <span>Data scope</span>
          <span className="text-[11px]">
            {scopeSummary(propertyType, priceMin, priceMax)} {scopeOpen ? "▲" : "▾"}
          </span>
        </button>

        {scopeOpen && (
          <div className="space-y-3 pt-1">
            {/* Property type — single choice */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Home type</span>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {PROPERTY_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setPropertyType(t.value)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                      propertyType === t.value
                        ? "bg-[#F43F5E] text-white shadow"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price band — two thumbs (min + max) on a shared scale */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Price band</span>
                <span className="text-[11px] font-medium text-foreground">
                  {priceMin <= PRICE_MIN && priceMax >= PRICE_MAX
                    ? "Any price"
                    : `${formatPrice(priceMin)} – ${formatPrice(priceMax)}`}
                </span>
              </div>
              <div className="relative h-5">
                <input
                  type="range"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  step={PRICE_STEP}
                  value={priceMin}
                  onChange={(e) =>
                    setPriceMin(Math.min(Number(e.target.value), priceMax - PRICE_STEP))
                  }
                  className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent accent-[#F43F5E] [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                  aria-label="Minimum price"
                />
                <input
                  type="range"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  step={PRICE_STEP}
                  value={priceMax}
                  onChange={(e) =>
                    setPriceMax(Math.max(Number(e.target.value), priceMin + PRICE_STEP))
                  }
                  className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent accent-[#F43F5E] [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                  aria-label="Maximum price"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scopes the market numbers only — everyone in the segment still gets
              the email, phrased around this slice.
            </p>
          </div>
        )}
      </div>

      {/* Preview — "what each email will include". Hidden when editing a saved
          campaign (no send happening). Fills the remaining height otherwise. */}
      {!editing && (
        <div className="mt-1 flex flex-1 flex-col justify-center rounded-xl border border-border bg-background/40 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Each email includes
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-foreground">
            <li className="flex gap-2">
              <span>✉️</span>
              <span className="text-muted-foreground">
                Subject like{" "}
                <span className="italic text-foreground">“{sampleSubject}”</span>
              </span>
            </li>
            <li className="flex gap-2">
              <span>📊</span>
              <span className="text-muted-foreground">
                A {topName} market snapshot —{" "}
                {mode === "magic" ? "live market data" : "sharpened by your MLS"}
              </span>
            </li>
            <li className="flex gap-2">
              <span>🏡</span>
              <span className="text-muted-foreground">
                A homeowner section <em>and</em> a buyer section
              </span>
            </li>
            <li className="flex gap-2">
              <span>🎨</span>
              <span className="text-muted-foreground">
                Your brand, headshot &amp; sign-off
              </span>
            </li>
          </ul>
        </div>
      )}

      {/* Editing filler — the campaign's neighborhoods, so the panel has no
          dead space and the ZIP list is visible while you tweak the map. */}
      {editing && (
        <div className="mt-1 flex flex-1 flex-col rounded-xl border border-border bg-background/40 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Neighborhoods in this campaign
          </p>
          <div className="mt-2 flex flex-wrap gap-1 overflow-y-auto">
            {selectedZips.map((z) => (
              <span
                key={z}
                className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
              >
                {z}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Click ZIPs on the map to add or remove.
          </p>
        </div>
      )}

      </div>
      {/* end scrollable body */}

      {/* CTA — pinned to the bottom so the panel bottom aligns with the map. */}
      <div className="mt-3 shrink-0 border-t border-border pt-3">
        <button
          type="button"
          disabled={launching || (!editing && recipientCount === 0)}
          onClick={() =>
            onLaunch(
              {
                lens,
                reach,
                depth,
                propertyType,
                priceMin: priceMin > PRICE_MIN ? priceMin : null,
                priceMax: priceMax < PRICE_MAX ? priceMax : null,
              },
              mode,
            )
          }
          className="w-full rounded-lg bg-[#F43F5E] px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#F43F5E]/20 transition hover:bg-[#e11d48] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {launching
            ? editing
              ? "Saving…"
              : "Starting…"
            : editing
              ? "💾 Save changes"
              : mode === "magic"
                ? "✨ Send it"
                : "🤓 Build my report"}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {editing
            ? "Updates this campaign's neighborhoods, angle, and data scope."
            : mode === "magic"
              ? "We'll pull live market data and draft every email for you."
              : "Next you'll see exactly which MLS fields to export for the deepest report."}
        </p>
      </div>
    </div>
  );
}
