"use client";

import { useState } from "react";
import { Sparkles, SlidersHorizontal, ArrowRight, ArrowLeft } from "lucide-react";

import { ProfileMagicChat } from "./ProfileMagicChat";
import { ProfileOnboardingChat } from "./ProfileOnboardingChat";

// ============================================================
// Entry point for new-profile onboarding. Presents two ways in:
//   • AI Magic Mode    — paste a website, AI builds the whole profile
//   • Control Freak Mode — the classic one-question-at-a-time chat
// ============================================================

type Mode = "magic" | "control" | null;

export function ProfileOnboardingLauncher() {
  const [mode, setMode] = useState<Mode>(null);

  if (mode === "magic") return <ProfileMagicChat onBack={() => setMode(null)} />;
  if (mode === "control") {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <button
          type="button"
          onClick={() => setMode(null)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to setup options
        </button>
        <ProfileOnboardingChat />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
      <div className="text-center mb-8 space-y-2">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-xl shadow-lg mb-1"
          style={{ background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)" }}
        >
          <Sparkles className="h-6 w-6 text-white animate-twinkle" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Let&apos;s build your profile
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Your profile powers personalization across every AiM app. Pick how
          you&apos;d like to set it up.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* AI Magic Mode */}
        <button
          type="button"
          onClick={() => setMode("magic")}
          className="group relative text-left glass-card rounded-2xl p-6 overflow-hidden transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#31DBA5]/50"
        >
          <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#31DBA5]/15 text-[#31DBA5] border border-[#31DBA5]/30">
            Recommended
          </span>
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 shadow-lg"
            style={{ background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)" }}
          >
            <Sparkles className="h-5 w-5 text-white animate-twinkle" />
          </div>
          <h2 className="text-lg font-bold text-foreground">AI Magic Mode</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
            Just paste your website. I&apos;ll analyze it and build your entire
            profile — brand, market, bio, even your colors and headshot. Verify
            and you&apos;re done.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#31DBA5]">
            Start the magic
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>

        {/* Control Freak Mode */}
        <button
          type="button"
          onClick={() => setMode("control")}
          className="group text-left glass-card rounded-2xl p-6 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-white/[0.06] border border-white/10">
            <SlidersHorizontal className="h-5 w-5 text-white/80" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Control Freak Mode</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
            Prefer to drive? I&apos;ll walk you through a few quick questions,
            one at a time, and you answer in your own words.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/90">
            Walk me through it
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>
    </div>
  );
}
