"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Send, Loader2, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmationCard, parseCards } from "./ConfirmationCard";
import { OnboardingProgress } from "./OnboardingProgress";

interface OnboardingChatProps {
  onComplete: () => void;
}

/** Extract all text content from a UIMessage's parts. */
function getMessageText(message: UIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function OnboardingChat({ onComplete }: OnboardingChatProps) {
  const [completedSections, setCompletedSections] = useState<Set<string>>(
    new Set()
  );
  const [currentSection, setCurrentSection] = useState<string | undefined>();
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/apps/blog-engine/onboarding/chat",
      }),
    []
  );

  const initialMessages: UIMessage[] = [
    {
      id: "system-welcome",
      role: "assistant",
      parts: [
        {
          type: "text" as const,
          text: "Welcome to Blog Engine! I'm going to help you set up your automated blog generation system. This will take about 5-10 minutes, and I'll walk you through everything step by step.\n\nLet's start with the basics — **what type of real estate professional are you?**\n\nAre you a:\n- Solo Agent\n- Team Leader\n- Team Agent\n- Broker / Owner\n- Loan Officer\n- Title Executive",
        },
      ],
    },
  ];

  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: initialMessages,
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Track current section from latest assistant message
  useEffect(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (lastAssistant) {
      const text = getMessageText(lastAssistant);
      const { cards } = parseCards(text);
      if (cards.length > 0) {
        const latestCard = cards[cards.length - 1];
        setCurrentSection(latestCard.section);
      }
    }
  }, [messages]);

  const saveSection = useCallback(
    async (section: string, fields: Record<string, unknown>) => {
      setSavingSection(section);
      try {
        const isComplete = section === "complete";
        const response = await fetch("/api/apps/blog-engine/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section,
            fields,
            complete: isComplete,
          }),
        });

        if (response.ok) {
          setCompletedSections((prev) => new Set([...prev, section]));
          if (isComplete) {
            onComplete();
          } else {
            // Automatically prompt the AI to continue to the next section
            await sendMessage({ text: "Confirmed. Let's continue to the next section." });
          }
        } else {
          console.error("Failed to save section:", await response.text());
        }
      } catch (err) {
        console.error("Error saving section:", err);
      } finally {
        setSavingSection(null);
      }
    },
    [onComplete]
  );

  const handleEdit = useCallback((section: string) => {
    setCompletedSections((prev) => {
      const next = new Set(prev);
      next.delete(section);
      return next;
    });
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

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="border-b bg-card/50">
        <OnboardingProgress
          completedSections={completedSections}
          currentSection={currentSection}
        />
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {messages.map((message) => {
          const text = getMessageText(message);
          const isUser = message.role === "user";

          if (isUser) {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="flex items-start gap-2 max-w-[80%]">
                  <div className="rounded-lg px-4 py-2.5 bg-primary text-primary-foreground text-sm">
                    {text}
                  </div>
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
              </div>
            );
          }

          // Assistant message — parse cards
          const { textWithoutCards, cards } = parseCards(text);

          return (
            <div key={message.id} className="flex justify-start">
              <div className="flex items-start gap-2 max-w-[80%]">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#31DBA5]/10 shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-[#31DBA5]" />
                </div>
                <div className="space-y-2">
                  {textWithoutCards && (
                    <div className="rounded-lg px-4 py-2.5 bg-card border text-sm text-foreground whitespace-pre-wrap">
                      <FormattedText text={textWithoutCards} />
                    </div>
                  )}
                  {cards.map((card) => (
                    <ConfirmationCard
                      key={card.section}
                      data={card}
                      onConfirm={saveSection}
                      onEdit={handleEdit}
                      isConfirmed={completedSections.has(card.section)}
                      isLoading={savingSection === card.section}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading indicator */}
        {status === "submitted" && (
          <div className="flex justify-start">
            <div className="flex items-start gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#31DBA5]/10 shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-[#31DBA5]" />
              </div>
              <div className="rounded-lg px-4 py-3 bg-card border">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Something went wrong. Please try again.
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4 bg-card/50">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-lg border bg-background px-4 py-2.5 text-sm",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              "min-h-[42px] max-h-[120px]"
            )}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
}

/**
 * Simple markdown-like text formatting (bold, lists).
 */
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        const formatted = line.replace(
          /\*\*(.*?)\*\*/g,
          '<strong class="font-semibold">$1</strong>'
        );

        if (line.trim().startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2 ml-2">
              <span className="text-muted-foreground">•</span>
              <span
                dangerouslySetInnerHTML={{
                  __html: formatted.replace(/^-\s+/, ""),
                }}
              />
            </div>
          );
        }

        const numberedMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          return (
            <div key={i} className="flex gap-2 ml-2">
              <span className="text-muted-foreground">
                {numberedMatch[1]}.
              </span>
              <span
                dangerouslySetInnerHTML={{
                  __html: numberedMatch[2].replace(
                    /\*\*(.*?)\*\*/g,
                    '<strong class="font-semibold">$1</strong>'
                  ),
                }}
              />
            </div>
          );
        }

        if (!line.trim()) {
          return <div key={i} className="h-2" />;
        }

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
