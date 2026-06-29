"use client";

import { NerdIcon } from "@/components/icons/NerdIcon";

export type SphereMode = "magic" | "control";

// ============================================================
// Sphere mode picker — the front door to a Hyperlocal campaign,
// mirroring the AI-Magic vs Control-Freak choice from profile
// onboarding. Here the choice maps to DATA SOURCE + depth:
//
//   AI Magic Mode  → we recommend ZIPs + auto-pull market data from
//                    our data provider. Fast, done-for-you, lighter.
//   Control Freak  → you pick ZIPs, tune the dials, and upload your
//                    own MLS export for the deepest metrics.
// ============================================================

export function SphereModeLauncher({
  onPick,
  totalContacts,
  neighborhoodCount,
}: {
  onPick: (mode: SphereMode) => void;
  totalContacts: number;
  neighborhoodCount: number;
}) {
  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold">How do you want to build this?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {neighborhoodCount > 0
            ? `${neighborhoodCount} neighborhoods · ${totalContacts.toLocaleString()} contacts in your sphere`
            : "Two ways to send a hyperlocal market update to your sphere"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* AI Magic Mode */}
        <button
          type="button"
          onClick={() => onPick("magic")}
          className="group aim-magic-card relative text-left glass-card rounded-2xl p-6 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#31DBA5]/50"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl group-hover:animate-[pixieFloat_1.6s_ease-in-out_infinite]">
              ✨
            </span>
            <h2 className="text-lg font-semibold text-white">AI Magic Mode</h2>
          </div>
          <p className="mt-3 text-sm text-white/80">
            Done for you. We&apos;ll recommend your best neighborhoods and pull
            live market data automatically — you just review and send.
          </p>
          <ul className="mt-4 space-y-1.5 text-xs text-white/70">
            <li>✓ We recommend the ZIPs (tweak any you like)</li>
            <li>✓ Market data pulled automatically — no upload</li>
            <li>✓ Fastest path from map to sent</li>
          </ul>
          <p className="mt-4 text-[11px] text-white/55">
            Auto-pulled data is solid but lighter than a full MLS export — no
            list-to-sale ratio and a few advanced metrics.
          </p>
          <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#31DBA5]">
            Start with Magic
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </button>

        {/* Control Freak Mode */}
        <button
          type="button"
          onClick={() => onPick("control")}
          className="group relative text-left glass-card rounded-2xl p-6 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <div className="flex items-center gap-3">
            <NerdIcon className="h-9 w-9 shrink-0 text-white/85 group-hover:animate-[glassesPush_1.4s_ease-in-out_infinite]" />
            <h2 className="text-lg font-semibold text-white">Control Freak Mode</h2>
          </div>
          <p className="mt-3 text-sm text-white/80">
            Your hands on every dial. Pick the exact ZIPs, tune the angle and
            reach, and feed it your own MLS export for the deepest report.
          </p>
          <ul className="mt-4 space-y-1.5 text-xs text-white/70">
            <li>✓ Hand-pick every neighborhood + slider</li>
            <li>✓ We show exactly which MLS fields to export</li>
            <li>✓ Full metrics — incl. list-to-sale ratio</li>
          </ul>
          <p className="mt-4 text-[11px] text-white/55">
            We&apos;ll still pre-fill live market data as a base, then your MLS
            upload sharpens every number.
          </p>
          <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-white">
            Take control
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </button>
      </div>
    </div>
  );
}
