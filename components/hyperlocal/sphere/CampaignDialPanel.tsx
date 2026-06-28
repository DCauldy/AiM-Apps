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
  /** The mode chosen at the picker. Magic = auto market data + approve-all;
   *  Control = your MLS upload + full editor. Drives the data depth (the old
   *  Depth dial) and the launch CTA. */
  mode: "magic" | "control";
  /** Launch a run. */
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
  mode,
  onLaunch,
  launching = false,
  initial,
}: CampaignDialPanelProps) {
  const [lens, setLens] = useState<DialLens>(initial?.lens ?? "balanced");
  // Depth is no longer a dial — the mode sets it. Both modes produce a real
  // (full) report: Magic from auto-pulled market data, Control from the
  // agent's MLS upload. Kept in DialValues for the launch contract.
  const depth: DialDepth = "full";
  // Slider is inverted vs min value: left = "warmest" (high min), right =
  // "everyone" (min 1). Store the raw min; render the slider reversed.
  const [reach, setReach] = useState<number>(initial?.reach ?? 3);

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

      {/* Dial 2 — Reach */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Reach</span>
          <span className="text-[11px] text-muted-foreground">
            {`${fullReportCount} of ${selected.length} get the full report`}
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

      {/* Launch — single CTA per mode (the mode was chosen at the picker). */}
      <div className="pt-1">
        <button
          type="button"
          disabled={launching || recipientCount === 0}
          onClick={() => onLaunch({ lens, reach, depth }, mode)}
          className="w-full rounded-lg bg-[#F43F5E] px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#F43F5E]/20 transition hover:bg-[#e11d48] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {launching
            ? "Starting…"
            : mode === "magic"
              ? "✨ Send it"
              : "🤓 Build my report"}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {mode === "magic"
            ? "We'll pull live market data and draft every email for you."
            : "Next you'll see exactly which MLS fields to export for the deepest report."}
        </p>
      </div>
    </div>
  );
}
