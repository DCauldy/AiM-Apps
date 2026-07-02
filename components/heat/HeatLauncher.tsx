"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { HeatBuildProgress } from "@/components/heat/HeatBuildProgress";
import { NerdIcon } from "@/components/icons/NerdIcon";
import { cn } from "@/lib/utils";

// ============================================================
// Heat launcher — the front door. AI-Magic vs Control-Freak, with
// Hyperlocal-style dials (range sliders + chips) so it stays dead
// simple: pick an area, drag the price band, hit go.
//   ✨ Magic   → ZIP + price band; ranked with recommended weights.
//   🤓 Control → adds property-type chips + Heat Score weight sliders.
// ============================================================

type Mode = "magic" | "control";
type Audience = "buyer" | "listing";

const PRICE_MIN = 0;
const PRICE_MAX = 3_000_000;
const PRICE_STEP = 25_000;

const PROPERTY_TYPES = [
  "Houses",
  "Condos",
  "Townhomes",
  "Multi-family",
  "Manufactured",
  "LotsLand",
] as const;

const WEIGHTS = [
  { key: "intent", label: "Buyer intent", hint: "Saves-to-views ratio" },
  { key: "traffic", label: "Traffic", hint: "Views per day on market" },
  { key: "freshness", label: "Freshness", hint: "New + already hot" },
  { key: "cutPenalty", label: "Price-cut penalty", hint: "Demote stale + discounted" },
] as const;

type WeightKey = (typeof WEIGHTS)[number]["key"];
const DEFAULT_WEIGHTS: Record<WeightKey, number> = {
  intent: 0.45,
  traffic: 0.25,
  freshness: 0.2,
  cutPenalty: 0.1,
};

function formatPrice(n: number): string {
  if (n >= PRICE_MAX) return "$3M+";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  return `$${Math.round(n / 1000)}k`;
}

export function HeatLauncher() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("magic");
  const [audience, setAudience] = useState<Audience>("buyer");
  const [zips, setZips] = useState("");
  const [priceMin, setPriceMin] = useState(PRICE_MIN);
  const [priceMax, setPriceMax] = useState(PRICE_MAX);
  const [types, setTypes] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<WeightKey, number>>(DEFAULT_WEIGHTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [build, setBuild] = useState<{ runId: string; searchId: string } | null>(null);
  const [pct, setPct] = useState(4);
  const [step, setStep] = useState<string | undefined>();

  const anyPrice = priceMin <= PRICE_MIN && priceMax >= PRICE_MAX;

  // Stream real progress from the heat-enrich run, then open the board.
  useEffect(() => {
    if (!build) return;
    const es = new EventSource(`/api/apps/heat/stream?runId=${build.runId}`);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "progress") {
          if (typeof msg.progress === "number") setPct(msg.progress);
          if (msg.step) setStep(msg.step);
        } else if (msg.type === "done") {
          es.close();
          router.push(`/apps/heat/board/${build.searchId}`);
        } else if (msg.type === "error") {
          es.close();
          setError(msg.message ?? "Something went wrong.");
          setBuild(null);
          setSubmitting(false);
        }
      } catch {
        /* ignore keepalives / parse noise */
      }
    };
    es.onerror = () => {
      // On transient drop, fall back to the board (it polls to readiness).
      es.close();
      router.push(`/apps/heat/board/${build.searchId}`);
    };
    return () => es.close();
  }, [build, router]);

  function toggleType(t: string) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function submit() {
    const zipList = zips
      .split(/[\s,]+/)
      .map((z) => z.trim())
      .filter(Boolean);
    if (zipList.length === 0) {
      setError("Enter at least one ZIP code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/apps/heat/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zips: zipList,
          minPrice: priceMin > PRICE_MIN ? priceMin : null,
          maxPrice: priceMax < PRICE_MAX ? priceMax : null,
          homeTypes: mode === "control" && types.length > 0 ? types.join(",") : null,
          mode,
          audience,
          weights: mode === "control" ? weights : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't start the search.");
      // Switch to the live build-progress view; it streams the run and
      // navigates to the board on completion.
      setBuild({ runId: data.runId, searchId: data.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (build) {
    return <HeatBuildProgress percent={pct} step={step} />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">Find the hottest listings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick an area and price range — we rank what buyers are actually watching.
        </p>
      </div>

      {/* Mode picker */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("magic")}
          className={cn(
            "glass-card group relative rounded-2xl p-5 text-left transition-transform hover:-translate-y-0.5 focus:outline-none",
            mode === "magic" ? "ring-2 ring-[#FF3B30]/70" : "ring-1 ring-white/10",
          )}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">✨</span>
            <h2 className="text-lg font-semibold text-white">AI Magic Mode</h2>
          </div>
          <p className="mt-2 text-sm text-white/80">
            Pick an area and price band. We rank the hottest listings with our
            recommended demand model.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("control")}
          className={cn(
            "glass-card group relative rounded-2xl p-5 text-left transition-transform hover:-translate-y-0.5 focus:outline-none",
            mode === "control" ? "ring-2 ring-[#FF3B30]/70" : "ring-1 ring-white/10",
          )}
        >
          <div className="flex items-center gap-3">
            <NerdIcon className="h-8 w-8 shrink-0 text-white/85" />
            <h2 className="text-lg font-semibold text-white">Control Freak Mode</h2>
          </div>
          <p className="mt-2 text-sm text-white/80">
            Add property-type filters and tune exactly what makes a listing
            &ldquo;hot&rdquo; with weight sliders.
          </p>
        </button>
      </div>

      {/* Form */}
      <div className="glass-card mt-4 rounded-2xl p-5">
        {/* ZIPs */}
        <label className="block text-sm font-medium text-white/90">
          ZIP code{mode === "control" ? "s" : ""}
        </label>
        <input
          value={zips}
          onChange={(e) => setZips(e.target.value)}
          placeholder={mode === "control" ? "37220, 37215, 37205" : "37220"}
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#FF3B30]/50"
        />

        {/* Price band — dual-thumb range */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white/90">Price band</span>
            <span className="text-sm font-semibold text-[#FF6A3D]">
              {anyPrice
                ? "Any price"
                : `${formatPrice(priceMin)} – ${formatPrice(priceMax)}`}
            </span>
          </div>
          <div className="relative mt-3 h-5">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#FF3B30] to-[#C2410C]"
              style={{
                left: `${(priceMin / PRICE_MAX) * 100}%`,
                right: `${100 - (priceMax / PRICE_MAX) * 100}%`,
              }}
            />
            <input
              type="range"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={PRICE_STEP}
              value={priceMin}
              onChange={(e) =>
                setPriceMin(Math.min(Number(e.target.value), priceMax - PRICE_STEP))
              }
              aria-label="Minimum price"
              className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent accent-[#FF3B30] [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto"
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
              aria-label="Maximum price"
              className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent accent-[#FF3B30] [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto"
            />
          </div>
        </div>

        {/* Control-only: property type chips + weight sliders */}
        {mode === "control" && (
          <>
            <div className="mt-5">
              <span className="block text-sm font-medium text-white/90">
                Property types
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROPERTY_TYPES.map((t) => {
                  const on = types.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        on
                          ? "bg-gradient-to-br from-[#FF3B30] to-[#C2410C] text-white"
                          : "border border-white/15 text-white/70 hover:text-white",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-white/45">
                None selected = all home types.
              </p>
            </div>

            <div className="mt-5">
              <span className="block text-sm font-medium text-white/90">
                What makes a listing hot?
              </span>
              <div className="mt-3 space-y-3">
                {WEIGHTS.map((w) => (
                  <div key={w.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/80">
                        {w.label}{" "}
                        <span className="text-white/40">· {w.hint}</span>
                      </span>
                      <span className="font-semibold text-[#FF6A3D]">
                        {Math.round(weights[w.key] * 100)}%
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-5">
                      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15" />
                      <div
                        className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#FF3B30] to-[#C2410C]"
                        style={{ width: `${weights[w.key] * 100}%` }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={weights[w.key]}
                        onChange={(e) =>
                          setWeights((prev) => ({
                            ...prev,
                            [w.key]: Number(e.target.value),
                          }))
                        }
                        aria-label={w.label}
                        className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent accent-[#FF3B30]"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setWeights(DEFAULT_WEIGHTS)}
                className="mt-2 text-[11px] text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
              >
                Reset to recommended
              </button>
            </div>
          </>
        )}

        {/* Audience toggle */}
        <div className="mt-5">
          <span className="block text-sm font-medium text-white/90">Frame results for</span>
          <div className="mt-2 inline-flex rounded-lg border border-white/15 bg-black/20 p-0.5">
            {(["buyer", "listing"] as Audience[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  audience === a
                    ? "bg-gradient-to-br from-[#FF3B30] to-[#C2410C] text-white"
                    : "text-white/70 hover:text-white",
                )}
              >
                {a === "buyer" ? "Buyer's agent" : "Listing agent"}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#FF3B30] to-[#C2410C] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
        >
          {submitting ? "Building your hot sheet…" : "🔥 Show me what's hot"}
        </button>
      </div>
    </div>
  );
}
