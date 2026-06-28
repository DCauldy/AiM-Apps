"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Caveat } from "next/font/google";
import { type UIMessage } from "@ai-sdk/react";
import { Sparkles, ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  fetchDraft,
  savedAgo,
  type OnboardingDraftRow,
} from "@/lib/profiles/onboarding-draft";
import { NerdIcon } from "@/components/icons/NerdIcon";
import { ProfileMagicChat, type MagicResume } from "./ProfileMagicChat";
import { ProfileOnboardingChat } from "./ProfileOnboardingChat";

// Handwriting font for the nerd's scribbled "fixing…" correction.
const caveat = Caveat({ subsets: ["latin"], weight: "700" });

// ============================================================
// Entry point for new-profile onboarding. Presents two ways in:
//   • AI Magic Mode    — paste a website, AI builds the whole profile
//   • Control Freak Mode — the classic one-question-at-a-time chat
// ============================================================

type Mode = "magic" | "control" | null;

// Cross-card banter — hovering one card makes the OTHER throw shade. Lines
// rotate so it's not the same quip every time.
const NERD_SHADE = [
  "🤓 Pfft, magic isn't real.",
  "🤓 I'd rather read the docs.",
  "🤓 Cutting corners, I see.",
];
const MAGIC_TEASE = [
  "✨ Suit yourself.",
  "✨ Have fun typing.",
  "✨ I'll be done before you start.",
];

// What the control freak "verifies" on hover (then unverifies, then redoes…).
const CHECK_ITEMS = ["Name spelled right", "Market double-checked", "Colors verified"];

// What the magic conjures into being on hover — each line materializes out of
// a blur, shimmering, like the AI is summoning the profile.
const MAGIC_CONJURE = [
  "✨ Conjuring your brand…",
  "✨ Summoning your headshot…",
  "✨ Writing your bio…",
];

// Tiny sparkles that drift off the Magic icon on hover. Positioned around the
// icon; staggered delays + horizontal drift make it feel alive.
const PIXIES = [
  { left: "2.6rem", top: "1.4rem", x: "10px", delay: "0s" },
  { left: "3.8rem", top: "2.6rem", x: "16px", delay: "0.25s" },
  { left: "2.0rem", top: "3.0rem", x: "-8px", delay: "0.5s" },
  { left: "4.4rem", top: "1.9rem", x: "6px", delay: "0.75s" },
];

export function ProfileOnboardingLauncher() {
  const [mode, setMode] = useState<Mode>(null);
  const [hovered, setHovered] = useState<"magic" | "control" | null>(null);
  // Saved draft (if any) so we can offer "Resume" on the matching card.
  const [draftRow, setDraftRow] = useState<OnboardingDraftRow | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    void fetchDraft().then(setDraftRow);
  }, []);

  const open = (which: "magic" | "control", doResume: boolean) => {
    setResuming(doResume);
    setMode(which);
  };
  // Returning to the picker re-reads the draft so the indicator is current
  // (autosave may have updated it while in a mode).
  const back = () => {
    setMode(null);
    void fetchDraft().then(setDraftRow);
  };

  const magicDraft = draftRow?.mode === "magic" ? draftRow : null;
  const controlDraft = draftRow?.mode === "control" ? draftRow : null;
  // Separate rotation counters per bubble, advanced only when THAT bubble is
  // about to appear — so the outgoing bubble keeps its text while fading out
  // (no mid-fade text flash when you switch cards).
  const [nerdIdx, setNerdIdx] = useState(0);
  const [magicIdx, setMagicIdx] = useState(0);
  const enter = (which: "magic" | "control") => {
    setHovered(which);
    // Hovering magic makes the nerd (control card) speak, and vice versa.
    if (which === "magic") setNerdIdx((i) => i + 1);
    else setMagicIdx((i) => i + 1);
  };

  if (mode === "magic")
    return (
      <ProfileMagicChat
        onBack={back}
        resume={resuming ? (draftRow?.data as MagicResume) : null}
      />
    );
  if (mode === "control")
    return (
      <ProfileOnboardingChat
        onBack={back}
        initialMessages={
          resuming
            ? (draftRow?.data as { messages?: UIMessage[] })?.messages
            : undefined
        }
      />
    );

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
      {/* Preload the chat background so it's cached before you pick a mode —
          otherwise the chat card flashes grey before the gradient paints. */}
      <link
        rel="preload"
        as="image"
        href="/aim-chat-bg.avif"
        type="image/avif"
      />
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
          onClick={() => open("magic", !!magicDraft)}
          onMouseEnter={() => enter("magic")}
          onMouseLeave={() => setHovered(null)}
          className="group aim-magic-card relative text-left glass-card rounded-2xl p-6 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#31DBA5]/50"
        >
          {/* pixie dust */}
          {PIXIES.map((p, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute text-[#31DBA5] opacity-0 text-xs group-hover:animate-[pixieFloat_1.3s_ease-in-out_infinite]"
              style={
                {
                  left: p.left,
                  top: p.top,
                  animationDelay: p.delay,
                  "--pixie-x": p.x,
                } as CSSProperties
              }
            >
              ✦
            </span>
          ))}
          {/* magic teases back when you hover the Control card */}
          <BickerBubble
            show={hovered === "control"}
            text={MAGIC_TEASE[magicIdx % MAGIC_TEASE.length]}
            tone="magic"
          />
          <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#31DBA5]/15 text-[#31DBA5] border border-[#31DBA5]/30">
            Recommended
          </span>
          <h2 className="flex items-center gap-3 text-lg font-bold text-foreground">
            <Sparkles className="h-14 w-14 shrink-0 text-[#31DBA5] animate-twinkle group-hover:animate-[magicPop_0.5s_ease]" />
            AI Magic Mode
          </h2>
          {magicDraft && <DraftBadge updatedAt={magicDraft.updated_at} />}
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed group-hover:hidden">
            Just paste your website. I&apos;ll analyze it and build your entire
            profile — brand, market, bio, even your colors and headshot. Verify
            and you&apos;re done.
          </p>
          {/* On hover the profile "conjures" itself — pieces materialize out
              of a blur, shimmering, one by one, then re-summon on a loop. */}
          <ul className="mt-1.5 hidden group-hover:block space-y-1.5">
            {MAGIC_CONJURE.map((line, i) => (
              <li
                key={line}
                className="text-[13px] font-medium opacity-0 group-hover:animate-[conjure_4.5s_ease-in-out_infinite]"
                style={{ animationDelay: `${i * 0.5}s` }}
              >
                <span className="bg-gradient-to-r from-[#31DBA5] via-white to-[#31DBA5] bg-[length:200%_100%] bg-clip-text text-transparent animate-[shimmer_2.5s_linear_infinite]">
                  {line}
                </span>
              </li>
            ))}
          </ul>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#31DBA5]">
            {magicDraft ? (
              <span>Resume your draft</span>
            ) : (
              <>
                <span className="group-hover:hidden">Start the magic</span>
                <span className="hidden group-hover:inline">🪄 Say the magic word</span>
              </>
            )}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>

        {/* Control Freak Mode */}
        <button
          type="button"
          onClick={() => open("control", !!controlDraft)}
          onMouseEnter={() => enter("control")}
          onMouseLeave={() => setHovered(null)}
          className="group relative text-left glass-card rounded-2xl p-6 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          {/* nerd shades the Magic card when you hover it */}
          <BickerBubble
            show={hovered === "magic"}
            text={NERD_SHADE[nerdIdx % NERD_SHADE.length]}
            tone="nerd"
          />
          <h2 className="flex items-center gap-3 text-lg font-bold text-foreground">
            <NerdIcon className="h-14 w-14 shrink-0 text-white/85 group-hover:animate-[glassesPush_1.4s_ease-in-out_infinite]" />
            Control Freak Mode
          </h2>
          {controlDraft && <DraftBadge updatedAt={controlDraft.updated_at} />}
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed group-hover:hidden">
            Prefer to drive? I&apos;ll walk you through a few quick questions,
            one at a time, and you answer in your own words.
          </p>
          {/* On hover the control freak "verifies" its work — ticks each item,
              strikes it through, then undoes and redoes it on a loop. */}
          <ul className="mt-1.5 hidden group-hover:block space-y-1.5">
            {CHECK_ITEMS.map((item, i) => {
              // Only the middle item ("Market double-checked") keeps re-doing
              // itself; the others tick once and stay checked.
              const obsessive = i === 1;
              const delay = `${i * 0.28}s`;
              const checkAnim = obsessive
                ? "group-hover:animate-[obsessiveCheck_6s_ease-in-out_forwards]"
                : "group-hover:animate-[selfCheckHold_0.45s_ease_forwards]";
              const strikeAnim = obsessive
                ? "group-hover:animate-[obsessiveStrike_6s_ease-in-out_forwards]"
                : "group-hover:animate-[selfStrikeHold_0.45s_ease_forwards]";
              return (
                <li
                  key={item}
                  className="flex items-center gap-2 text-[12px] text-white/80"
                >
                  <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-white/30">
                    <Check
                      className={cn("h-3 w-3 text-[#31DBA5] opacity-0", checkAnim)}
                      style={{ animationDelay: delay }}
                    />
                  </span>
                  <span className="relative">
                    {item}
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 h-px w-full origin-left scale-x-0 bg-white/50",
                        strikeAnim,
                      )}
                      style={{ animationDelay: delay }}
                    />
                  </span>
                  {obsessive && (
                    <span
                      className={cn(
                        caveat.className,
                        "ml-1 text-[22px] leading-none text-amber-300 opacity-0 group-hover:animate-[fixingWrite_6s_ease-in-out_forwards]",
                      )}
                      style={{ animationDelay: delay }}
                    >
                      fixing…
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/90">
            {controlDraft ? (
              <span>Resume your draft</span>
            ) : (
              <>
                <span className="group-hover:hidden">Walk me through it</span>
                <span className="hidden group-hover:inline">🤓 Akshually, I&apos;ve got this</span>
              </>
            )}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>
    </div>
  );
}

/** "Draft saved · 3 mins ago" pill shown on the card with an in-progress draft. */
function DraftBadge({ updatedAt }: { updatedAt: string }) {
  return (
    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#31DBA5]/15 border border-[#31DBA5]/30 px-2.5 py-0.5 text-[11px] font-medium text-[#31DBA5]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#31DBA5]" />
      Draft saved · {savedAgo(updatedAt)}
    </span>
  );
}

/** A chat-bubble (with tail) of shade one card throws when you hover the
 *  other — solid fill + tail so it reads like an iMessage. */
function BickerBubble({
  show,
  text,
  tone,
}: {
  show: boolean;
  text: string;
  tone: "magic" | "nerd";
}) {
  const color = tone === "magic" ? "#1C4C8A" : "#3C4250";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "chat-tail pointer-events-none absolute bottom-5 right-4 max-w-[80%] rounded-2xl px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg transition-all duration-200",
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
      )}
      style={{ background: color, ["--tail-color"]: color } as CSSProperties}
    >
      {text}
    </span>
  );
}
