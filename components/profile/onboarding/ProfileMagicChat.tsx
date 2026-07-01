"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Globe, Loader2, Send, Sparkles, ArrowLeft, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { Circuitry } from "@/components/decor/Circuitry";
import { useDraftAutosave } from "@/lib/profiles/onboarding-draft";
import { AutosaveBadge } from "./AutosaveBadge";
import { ProfileSummaryCard, type ProfileDraft } from "./ProfileSummaryCard";

// ============================================================
// AI Magic onboarding. The user enters ONE thing — their website —
// and we build their whole profile from it. The flow is deliberately
// theatrical: a URL prompt → a "watch it work" analysis reveal →
// a pre-filled, correctable profile. Should feel like zero effort.
// ============================================================

type Phase = "url" | "analyzing" | "review" | "error";

/** Saved snapshot for resume (mirrors what we autosave). */
export interface MagicResume {
  draft: ProfileDraft;
  found?: string[];
  lowConfidence?: string[];
  url?: string;
}

export function ProfileMagicChat({
  onBack,
  resume,
}: {
  onBack: () => void;
  resume?: MagicResume | null;
}) {
  const [phase, setPhase] = useState<Phase>(resume?.draft ? "review" : "url");
  const [url, setUrl] = useState(resume?.url ?? "");
  const [draft, setDraft] = useState<ProfileDraft | null>(resume?.draft ?? null);
  const [found, setFound] = useState<string[]>(resume?.found ?? []);
  const [lowConfidence, setLowConfidence] = useState<string[]>(
    resume?.lowConfidence ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  // Autosave the draft once we have one to review, so the user can leave and
  // come back. (We don't save during URL entry / analysis — nothing useful yet.)
  const saveStatus = useDraftAutosave(
    "magic",
    { draft, found, lowConfidence, url },
    phase === "review" && !!draft,
  );
  // Progress is REAL — driven by milestones the background task reports.
  // `progress` is what we render; `progressTarget` is the latest milestone;
  // the easing effect glides between them so it feels live, not steppy.
  const [progress, setProgress] = useState(0);
  const [progressTarget, setProgressTarget] = useState(0);
  const [stepText, setStepText] = useState("Starting…");

  const [correction, setCorrection] = useState("");
  const [refining, setRefining] = useState(false);
  const correctionRef = useRef<HTMLInputElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const settledRef = useRef(false);
  // The analysis runs on a background task independent of this SSE stream, so
  // if the stream drops (e.g. a serverless function hitting its duration cap
  // mid-analysis) we reconnect to the same runId and resume — subscribeToRun
  // replays current state, so no progress is lost.
  const runIdRef = useRef<string | null>(null);
  const reconnectRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Critical fields the site often doesn't expose — we ask for these.
  const gaps: string[] = draft
    ? ([
        ["physical_address", "office mailing address"],
        ["reply_to_email", "reply-to email"],
      ] as const)
        .filter(([key]) => !draft[key as keyof typeof draft])
        .map(([, label]) => label)
    : [];

  // Glide the rendered bar toward the latest real milestone. A small forward
  // creep past the target (capped at 96%) keeps it moving during the long
  // AI step so it never sits dead-still; only the real "done" reaches 100%.
  useEffect(() => {
    if (phase !== "analyzing") return;
    const id = setInterval(() => {
      setProgress((p) => {
        const ceil = progressTarget >= 100 ? 100 : Math.min(progressTarget + 8, 96);
        if (p >= ceil) return p;
        return p + (ceil - p) * 0.08 + 0.2;
      });
    }, 120);
    return () => clearInterval(id);
  }, [phase, progressTarget]);

  // Tear down the stream if the component unmounts mid-analysis.
  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  // Max stream reconnects before we give up. Each reconnect is a fresh,
  // short-lived stream invocation resuming the same background run, so this
  // comfortably outlasts a multi-minute analysis even when the serverless
  // function's per-invocation duration is short.
  const MAX_RECONNECTS = 10;

  const openStream = (runId: string) => {
    const es = new EventSource(
      `/api/profiles/onboarding/analyze/stream?runId=${encodeURIComponent(runId)}`,
    );
    esRef.current = es;

    es.onmessage = (ev) => {
        let msg: {
          type: string;
          progress?: number;
          step?: string;
          message?: string;
          draft?: ProfileDraft;
          found?: string[];
          lowConfidence?: string[];
        };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "progress") {
          if (typeof msg.progress === "number") setProgressTarget(msg.progress);
          if (msg.step) setStepText(msg.step);
        } else if (msg.type === "done" && msg.draft) {
          settledRef.current = true;
          es.close();
          esRef.current = null;
          setProgressTarget(100);
          setProgress(100);
          setDraft(msg.draft);
          setFound(msg.found ?? []);
          setLowConfidence(msg.lowConfidence ?? []);
          setTimeout(() => setPhase("review"), 400);
        } else if (msg.type === "error") {
          settledRef.current = true;
          es.close();
          esRef.current = null;
          setError(msg.message || "Something went wrong.");
          setPhase("error");
        }
      };

    es.onerror = () => {
      if (settledRef.current) return; // normal close after done
      es.close();
      esRef.current = null;
      // The background run keeps going regardless — reconnect and resume
      // rather than failing on a transient stream drop / function timeout.
      if (reconnectRef.current < MAX_RECONNECTS) {
        reconnectRef.current += 1;
        setStepText("Reconnecting…");
        reconnectTimerRef.current = setTimeout(() => {
          if (settledRef.current) return;
          openStream(runId);
        }, 1500);
        return;
      }
      settledRef.current = true;
      setError("Lost the connection while analyzing. Please try again.");
      setPhase("error");
    };
  };

  const analyze = async () => {
    const value = url.trim();
    if (!value) return;
    settledRef.current = false;
    reconnectRef.current = 0;
    setError(null);
    setStepText("Starting…");
    setProgress(0);
    setProgressTarget(4);
    setPhase("analyzing");
    try {
      const res = await fetch("/api/profiles/onboarding/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = await res.json();
      if (!res.ok || !data.runId)
        throw new Error(data.error || "Couldn't start the analysis.");
      runIdRef.current = data.runId;
      openStream(data.runId);
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
        <div className="flex justify-center pt-1">
          <AutosaveBadge status={saveStatus} />
        </div>
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
            <span className="block font-semibold text-white">
              Beep boop! 🤖
            </span>
            <span className="mt-1 block">
              Drop your website below and I&apos;ll build your entire profile
              from it — brand, market, bio, the works.
            </span>
            <span className="mt-2 block text-[13px] text-white/70">
              No forms. No 20 questions. Just paste the link. ✨
            </span>
          </BotBubble>

          {phase === "analyzing" && (
            <AnalyzingBubble step={stepText} progress={progress} />
          )}

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
                  <ProfileSummaryCard draft={draft} />
                </div>
              </div>

              {gaps.length > 0 && (
                <BotBubble>
                  <span className="font-semibold">
                    Couple things I couldn&apos;t find on your site —
                  </span>{" "}
                  what&apos;s your {gaps.join(" and ")}? Just type it below (these
                  keep your emails compliant).
                </BotBubble>
              )}
            </>
          )}
        </div>

        {/* Input area — swaps based on phase */}
        <div className="relative z-10 border-t-2 border-[#31DBA5]/30 p-3.5 bg-black/20">
          {phase === "review" ? (
            <>
              <div className="flex items-center gap-1.5 mb-2 px-0.5">
                <MessageSquare className="h-3.5 w-3.5 text-[#31DBA5]" />
                <span className="text-xs font-semibold text-white/90">
                  Chat with the AI to make changes
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  ref={correctionRef}
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && refine()}
                  placeholder={
                    gaps.length > 0
                      ? `Add your ${gaps[0]}… or tell me what to tweak`
                      : "Tell me what to tweak… (e.g. 'I'm with eXp now')"
                  }
                  disabled={refining}
                  className="flex-1 rounded-xl border-2 border-white/25 bg-white/[0.10] px-4 py-3 text-[15px] text-white placeholder:text-white/55 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#31DBA5]/60 focus:border-[#31DBA5]/60 transition-colors"
                />
                <SendButton onClick={refine} disabled={refining || !correction.trim()} loading={refining} />
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && phase !== "analyzing" && analyze()}
                  placeholder="yourwebsite.com"
                  disabled={phase === "analyzing"}
                  autoFocus
                  className="w-full rounded-xl border-2 border-white/25 bg-white/[0.10] pl-10 pr-3 py-3 text-[15px] text-white placeholder:text-white/55 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#31DBA5]/60 focus:border-[#31DBA5]/60 disabled:opacity-50 transition-colors"
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

      {/* Back to mode picker — under the chatbox. */}
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

function AnalyzingBubble({ step, progress }: { step: string; progress: number }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2 max-w-[85%] w-full">
        <Avatar />
        <div className="flex-1 rounded-2xl rounded-tl-sm px-4 py-3 bg-white/[0.06] border border-white/10 text-sm text-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#31DBA5] animate-twinkle shrink-0" />
            <span className="bg-gradient-to-r from-white/60 via-white to-white/60 bg-[length:200%_100%] bg-clip-text text-transparent animate-[shimmer_2s_linear_infinite]">
              {step}
            </span>
          </div>
          {/* Eased progress bar — climbs toward ~95% then snaps to 100%. */}
          <div className="mt-2.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-200 ease-out"
              style={{
                width: `${Math.round(progress)}%`,
                background: "linear-gradient(90deg, #1C4C8A 0%, #31DBA5 100%)",
              }}
            />
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
        "flex items-center justify-center w-11 h-11 self-end rounded-xl shrink-0 transition-opacity bg-white text-[#1C4C8A] shadow-sm",
        "disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90",
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
    </button>
  );
}
