"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Bot, Loader2, Send, Sparkles, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Circuitry } from "@/components/decor/Circuitry";
import { ProfileSummaryCard, type ProfileDraft } from "./ProfileSummaryCard";

// ============================================================
// Conversational platform-profile onboarding.
//
// Asks 6 questions, parses a final :::profile JSON block from the
// streamed assistant response, and surfaces it as a confirmable
// ProfileSummaryCard. On confirm → POST /api/profiles, stamp
// welcome dismiss, redirect to /apps.
//
// Escape hatch: a small "use the form instead" link in the corner
// routes power users (especially those adding a 2nd profile via
// /apps/profile/new from the multi-profile list) to the legacy
// 5-tab ProfileEditor at /apps/profile/new?form=1.
// ============================================================

function getMessageText(message: UIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Extract a :::profile {...} ::: block from streamed text, if present. */
function parseProfileBlock(
  text: string,
): { draft: ProfileDraft | null; textWithoutBlock: string } {
  const match = text.match(/:::profile\s*\n([\s\S]*?)\n:::/);
  if (!match) return { draft: null, textWithoutBlock: text };
  try {
    const parsed = JSON.parse(match[1]) as Partial<ProfileDraft>;
    if (
      typeof parsed.full_name === "string" &&
      typeof parsed.professional_type === "string" &&
      typeof parsed.brokerage === "string" &&
      typeof parsed.state === "string" &&
      typeof parsed.metro_area === "string"
    ) {
      return {
        draft: {
          full_name: parsed.full_name,
          professional_type: parsed.professional_type,
          brokerage: parsed.brokerage,
          state: parsed.state.toUpperCase(),
          metro_area: parsed.metro_area,
          bio: typeof parsed.bio === "string" ? parsed.bio : null,
        },
        textWithoutBlock: text.replace(/:::profile\s*\n[\s\S]*?\n:::/, "").trim(),
      };
    }
  } catch {
    // Streaming may surface the block mid-write; ignore until valid JSON.
  }
  return { draft: null, textWithoutBlock: text };
}

const SEED_MESSAGE: UIMessage = {
  id: "seed-welcome",
  role: "assistant",
  parts: [
    {
      type: "text" as const,
      text: "Beep boop! 🤖 - Hey, welcome to AiM Automations. I'll ask you a few quick questions and we'll have your profile set up in just a couple of minutes.\n\nFirst things first: **what's your full name?**",
    },
  ],
};

export function ProfileOnboardingChat() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/profiles/onboarding/chat",
      }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: [SEED_MESSAGE],
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEditDraft = async () => {
    inputRef.current?.focus();
    await sendMessage({ text: "Actually, I want to change something." });
  };

  return (
    <div className="relative max-w-2xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="text-center mb-6 space-y-2">
        <div
          className="inline-flex items-center justify-center w-11 h-11 rounded-xl shadow-lg mb-1"
          style={{
            background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
          }}
        >
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          Let&apos;s build your profile
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Your profile is the engine behind every AiM Automation — it tailors
          your blogs, campaigns, and outreach to your brand, market, and voice.
          Answer a few quick questions and you&apos;re ready to launch.
        </p>
      </div>

      {/* Chat surface — glassmorphic card carrying the AiM teal-blue brand
          gradient so the chatbot keeps the dashboard look even on a plain
          dark-grey page. The translucent white sheen (first layer) is the
          same one .glass-card normally applies; we stack it over the brand
          gradient image here. */}
      <div
        className="relative glass-card rounded-2xl overflow-hidden flex flex-col h-[600px]"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%), url('/aim-chat-bg.avif')",
          backgroundSize: "cover, cover",
          backgroundPosition: "center, center",
        }}
      >
        {/* Decorative circuitry inside the chatbox — same pattern + pulse as
            the AiM dashboard chatbot. Sits behind the conversation (content
            below is z-10). */}
        <Circuitry
          color="white"
          opacity={0.06}
          scale={0.7}
          position={{ bottom: "-80px", right: "-40px" }}
          transformOrigin="bottom right"
          pulse={{ opacity: 0.18, duration: "6s" }}
        />
        <div
          ref={scrollRef}
          className="relative z-10 flex-1 overflow-y-auto px-4 py-6 space-y-4"
        >
          {messages.map((message) => {
            const text = getMessageText(message);
            const isUser = message.role === "user";

            if (isUser) {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="flex items-start gap-2 max-w-[85%]">
                    <div
                      className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
                      }}
                    >
                      {text}
                    </div>
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10 border border-white/10 shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5 text-white/80" />
                    </div>
                  </div>
                </div>
              );
            }

            const { draft, textWithoutBlock } = parseProfileBlock(text);

            return (
              <div key={message.id} className="flex justify-start">
                <div className="flex items-start gap-2 max-w-[85%]">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#31DBA5]/15 border border-[#31DBA5]/20 shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-[#31DBA5]" />
                  </div>
                  <div className="space-y-2 min-w-0">
                    {textWithoutBlock && (
                      <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 bg-white/[0.06] border border-white/10 text-sm text-foreground whitespace-pre-wrap">
                        <FormattedText text={textWithoutBlock} />
                      </div>
                    )}
                    {draft && (
                      <ProfileSummaryCard
                        draft={draft}
                        onEdit={handleEditDraft}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#31DBA5]/15 border border-[#31DBA5]/20 shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-[#31DBA5]" />
                </div>
                <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white/[0.06] border border-white/10">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Something went wrong. Try again, or refresh the page.
            </div>
          )}
        </div>

        {/* Input */}
        <div className="relative z-10 border-t border-white/10 p-3 bg-white/[0.02]">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer…"
              rows={1}
              disabled={isLoading}
              className={cn(
                "flex-1 resize-none rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#31DBA5]/40 focus:border-[#31DBA5]/40",
                "min-h-[42px] max-h-[120px]",
              )}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-opacity bg-white text-[#1C4C8A] shadow-sm",
                "disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90",
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Minimal markdown rendering — bold + bullets only, matches blog-engine. */
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const formatted = line.replace(
          /\*\*(.*?)\*\*/g,
          '<strong class="font-semibold text-foreground">$1</strong>',
        );

        if (line.trim().startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2 ml-1">
              <span className="text-muted-foreground">•</span>
              <span
                dangerouslySetInnerHTML={{
                  __html: formatted.replace(/^-\s+/, ""),
                }}
              />
            </div>
          );
        }

        if (!line.trim()) return <div key={i} className="h-2" />;

        return (
          <span key={i}>
            <span dangerouslySetInnerHTML={{ __html: formatted }} />
            {i < lines.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
}
