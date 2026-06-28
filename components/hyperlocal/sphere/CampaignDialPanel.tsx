"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { SphereZip } from "@/lib/hyperlocal/sphere";

export type DialLens = "seller" | "balanced" | "buyer";
export type DialDepth = "quick" | "full";

export interface DialValues {
  lens: DialLens;
  /** min_segment_size — the "big enough for a full report" threshold. */
  reach: number;
  depth: DialDepth;
}

export interface CampaignDialPanelProps {
  selectedZips: string[];
  sphereZips: SphereZip[];
  /** Launch a run. mode "magic" = AI finishes it; "control" = review each. */
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

// Reach maps to min_segment_size: LOW threshold → "everyone" gets the full
// report; HIGH threshold → only the warmest/densest neighborhoods do.
const REACH_MIN = 1; // everyone
const REACH_MAX = 20; // just the warmest

export function CampaignDialPanel({
  selectedZips,
  sphereZips,
  onLaunch,
  launching = false,
  initial,
}: CampaignDialPanelProps) {
  const [lens, setLens] = useState<DialLens>(initial?.lens ?? "balanced");
  const [depth, setDepth] = useState<DialDepth>(initial?.depth ?? "quick");
  // Slider is inverted vs min value: left = "warmest" (high min), right =
  // "everyone" (min 1). Store the raw min; render the slider reversed.
  const [reach, setReach] = useState<number>(initial?.reach ?? 3);

  const selectedSet = useMemo(() => new Set(selectedZips), [selectedZips]);
  const selected = useMemo(
    () => sphereZips.filter((z) => selectedSet.has(z.zip)),
    [sphereZips, selectedSet],
  );

  // Recipient tally respects the angle (seller→home owners, buyer→searchers).
  const recipientCount = useMemo(() => {
    return selected.reduce((sum, z) => {
      if (lens === "seller") return sum + z.seller_count;
      if (lens === "buyer") return sum + z.buyer_count;
      return sum + z.contact_count;
    }, 0);
  }, [selected, lens]);

  // How many selected neighborhoods clear the "full report" bar (full depth).
  const fullReportCount = useMemo(
    () => selected.filter((z) => z.contact_count >= reach).length,
    [selected, reach],
  );

  const topName = selected[0]?.zip ?? "your area";
  const sampleSubject =
    ANGLE_STOPS.find((s) => s.lens === lens)?.subject(topName) ?? "";

  const angleIndex = ANGLE_STOPS.findIndex((s) => s.lens === lens);

  return (
    <div className="rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl p-5 space-y-5">
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

      {/* Dial 1 — Angle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Angle</span>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {ANGLE_STOPS.map((s, i) => (
            <button
              key={s.lens}
              type="button"
              onClick={() => setLens(s.lens)}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                i === angleIndex
                  ? "bg-[#F43F5E] text-white shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground italic truncate">
          “{sampleSubject}”
        </p>
      </div>

      {/* Dial 2 — Depth */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Depth</span>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setDepth("quick")}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              depth === "quick"
                ? "bg-[#F43F5E] text-white shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            ⚡ Quick note
          </button>
          <button
            type="button"
            onClick={() => setDepth("full")}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              depth === "full"
                ? "bg-[#F43F5E] text-white shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            📊 Full report
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {depth === "quick"
            ? "A warm, personal market note — no data upload needed."
            : "A stats-rich report. You'll add MLS numbers next."}
        </p>
      </div>

      {/* Dial 3 — Reach (only meaningful for full reports) */}
      <div
        className={cn(
          "space-y-2 transition-opacity",
          depth === "quick" && "opacity-40 pointer-events-none",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Reach</span>
          <span className="text-[11px] text-muted-foreground">
            {depth === "quick"
              ? "everyone selected"
              : `${fullReportCount} of ${selected.length} get the full report`}
          </span>
        </div>
        {/* Inverted slider: left = warmest (high min), right = everyone (min 1) */}
        <input
          type="range"
          min={REACH_MIN}
          max={REACH_MAX}
          step={1}
          value={REACH_MAX - reach + REACH_MIN}
          onChange={(e) =>
            setReach(REACH_MAX - Number(e.target.value) + REACH_MIN)
          }
          className="w-full accent-[#F43F5E]"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Just my warmest</span>
          <span>Everyone</span>
        </div>
      </div>

      {/* Launch */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          disabled={launching}
          onClick={() => onLaunch({ lens, reach, depth }, "magic")}
          className="rounded-lg bg-[#F43F5E] px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#F43F5E]/20 transition hover:bg-[#e11d48] disabled:opacity-60"
        >
          {launching ? "Starting…" : "✨ Send it"}
        </button>
        <button
          type="button"
          disabled={launching}
          onClick={() => onLaunch({ lens, reach, depth }, "control")}
          className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
        >
          🤓 Review each
        </button>
      </div>
    </div>
  );
}
