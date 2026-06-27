"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Globe, Loader2, Send, Sparkles, ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Circuitry } from "@/components/decor/Circuitry";
import { ProfileSummaryCard, type ProfileDraft } from "./ProfileSummaryCard";

// ============================================================
// AI Magic onboarding. The user enters ONE thing — their website —
// and we build their whole profile from it. The flow is deliberately
// theatrical: a URL prompt → a "watch it work" analysis reveal →
// a pre-filled, correctable profile. Should feel like zero effort.
// ============================================================

type Phase = "url" | "analyzing" | "review" | "error";

// Faux-progress narration shown during the single analyze call. Cycling
// these makes the wait feel alive and magical instead of a dead spinner.
const ANALYZING_STEPS = [
  "Opening your website…",
  "Reading your homepage…",
  "Studying your About & Team pages…",
  "Figuring out your market…",
  "Pulling your brand colors…",
  "Finding your logo & headshot…",
  "Writing your bio in your voice…",
  "Polishing your profile…",
];

export function ProfileMagicChat({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>("url");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [lowConfidence, setLowConfidence] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  const [correction, setCorrection] = useState("");
  const [refining, setRefining] = useState(false);
  const correctionRef = useRef<HTMLInputElement>(null);

  // Drive the analyzing narration while the request is in flight.
  useEffect(() => {
    if (phase !== "analyzing") return;
    setStepIdx(0);
    const id = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, ANALYZING_STEPS.length - 1));
    }, 1400);
    return () => clearInterval(id);
  }, [phase]);

  const analyze = async () => {
    const value = url.trim();
    if (!value) return;
    setError(null);
    setPhase("analyzing");
    try {
      const res = await fetch("/api/profiles/onboarding/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setDraft(data.draft as ProfileDraft);
      setFound(Array.isArray(data.found) ? data.found : []);
      setLowConfidence(Array.isArray(data.lowConfidence) ? data.lowConfidence : []);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("error");
    }
  };

  const refine = async () => {
    const text = correction.trim();
    if (!text || !draft || refining) return;
    setRefining(true);
    setCorrection("");
    try {
      const res = await fetch("/api/profiles/onboarding/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: draft, instruction: text }),
      });
      const data = await res.json();
      if (res.ok && data.draft) setDraft(data.draft as ProfileDraft);
    } finally {
      setRefining(false);
    }
  };

  return (
    <div className="relative max-w-2xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="text-center mb-6 space-y-2">
        <div
          className="inline-flex items-center justify-center w-11 h-11 rounded-xl shadow-lg mb-1"
          style={{ background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)" }}
        >
          <Sparkles className="h-5 w-5 text-white animate-twinkle" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">AI Magic setup</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Give me your website and I&apos;ll build your whole profile from it —
          brand, market, bio, the works. Sit back, this is the fun part.
        </p>
      </div>

      <div
        className="relative glass-card rounded-2xl overflow-hidden flex flex-col min-h-[520px]"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%), url('/aim-chat-bg.avif')",
          backgroundSize: "cover, cover",
          backgroundPosition: "center, center",
        }}
      >
        <Circuitry
          color="white"
          opacity={0.06}
          scale={0.7}
          position={{ bottom: "-80px", right: "-40px" }}
          transformOrigin="bottom right"
          pulse={{ opacity: 0.18, duration: "6s" }}
        />

        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {/* Opening bot message */}
          <BotBubble>
            Beep boop! 🤖 — drop your website below and I&apos;ll build your
            entire profile from it.
            <br />
            No forms, no 20 questions. Just paste the link.
          </BotBubble>

          {phase === "analyzing" && <AnalyzingBubble step={ANALYZING_STEPS[stepIdx]} />}

          {phase === "error" && (
            <div className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {phase === "review" && draft && (
            <>
              <BotBubble>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-[#31DBA5] animate-twinkle" />
                  Done — here&apos;s what I built for you.
                </span>
                {found.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {found.map((f) => (
                      <li key={f} className="text-[13px] text-white/80">
                        ✓ {f}
                      </li>
                    ))}
                  </ul>
                )}
                <span className="mt-2 block text-white/80">
                  Look it over — tell me anything to fix, or create your profile.
                </span>
              </BotBubble>

              {lowConfidence.length > 0 && (
                <div className="mx-auto max-w-md rounded-lg border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 text-[13px] text-amber-200">
                  Worth a quick double-check: {lowConfidence.join(", ")}
                </div>
              )}

              <div className="flex justify-start">
                <div className="flex items-start gap-2 w-full max-w-[95%]">
                  <Avatar />
                  <ProfileSummaryCard
                    draft={draft}
                    onEdit={() => correctionRef.current?.focus()}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Input area — swaps based on phase */}
        <div className="relative z-10 border-t border-white/10 p-3 bg-white/[0.02]">
          {phase === "review" ? (
            <div className="flex gap-2">
              <input
                ref={correctionRef}
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && refine()}
                placeholder="Tell me what to tweak… (e.g. 'I'm with eXp now')"
                disabled={refining}
                className="flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#31DBA5]/40"
              />
              <SendButton onClick={refine} disabled={refining || !correction.trim()} loading={refining} />
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && phase !== "analyzing" && analyze()}
                  placeholder="yourwebsite.com"
                  disabled={phase === "analyzing"}
                  autoFocus
                  className="w-full rounded-lg border border-white/15 bg-white/[0.04] pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#31DBA5]/40 disabled:opacity-50"
                />
              </div>
              <SendButton
                onClick={analyze}
                disabled={phase === "analyzing" || !url.trim()}
                loading={phase === "analyzing"}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer: back to mode picker / fallback */}
      <button
        type="button"
        onClick={onBack}
        className="mt-4 mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {phase === "error" ? "Go back and try a different way" : "Back to setup options"}
      </button>
    </div>
  );
}

function Avatar() {
  return (
    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#31DBA5]/15 border border-[#31DBA5]/20 shrink-0 mt-0.5">
      <Bot className="h-3.5 w-3.5 text-[#31DBA5]" />
    </div>
  );
}

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2 max-w-[85%]">
        <Avatar />
        <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 bg-white/[0.06] border border-white/10 text-sm text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

function AnalyzingBubble({ step }: { step: string }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2 max-w-[85%]">
        <Avatar />
        <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white/[0.06] border border-white/10 text-sm text-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#31DBA5] animate-twinkle shrink-0" />
            <span className="bg-gradient-to-r from-white/60 via-white to-white/60 bg-[length:200%_100%] bg-clip-text text-transparent animate-[shimmer_2s_linear_infinite]">
              {step}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SendButton({
  onClick,
  disabled,
  loading,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-opacity bg-white text-[#1C4C8A] shadow-sm",
        "disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90",
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
    </button>
  );
}
