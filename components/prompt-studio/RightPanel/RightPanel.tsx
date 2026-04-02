"use client";

import { useState } from "react";
import { Copy, Check, Globe, Loader2, Layers, User, ListTodo, ArrowRight, Sparkles, Shuffle, Bookmark } from "lucide-react";
import type { Suggestions } from "../PromptStudioShell";

const TYPE_LABELS: Record<string, string> = {
  auto: "Auto",
  standard: "Standard",
  reasoning: "Reasoning",
  "deep-research": "Deep Research",
  "custom-gpt": "Custom GPT",
  video: "Video",
  voice: "Voice",
  image: "Image",
};

const TASK_TYPE_MAP: Array<{ keywords: string[]; label: string }> = [
  { keywords: ["write", "draft", "compose", "author", "writing"], label: "Write" },
  { keywords: ["analyze", "analyse", "review", "evaluate", "assess", "critique"], label: "Analyze" },
  { keywords: ["summarize", "summarise", "condense", "recap", "tldr", "summary"], label: "Summarize" },
  { keywords: ["explain", "describe", "teach", "help me understand", "what is", "how does"], label: "Explain" },
  { keywords: ["translate", "localize"], label: "Translate" },
  { keywords: ["research", "investigate", "fact-check", "find information"], label: "Research" },
  { keywords: ["compare", "contrast", "difference between", "vs "], label: "Compare" },
  { keywords: ["plan", "schedule", "roadmap", "outline", "strategy"], label: "Plan" },
  { keywords: ["edit", "proofread", "fix", "correct", "revise", "rewrite"], label: "Edit" },
  { keywords: ["code", "program", "script", "function", "implement", "develop", "build"], label: "Code" },
  { keywords: ["generate", "create", "make", "design", "produce"], label: "Generate" },
  { keywords: ["optimize", "improve", "enhance", "refine", "better"], label: "Optimize" },
  { keywords: ["list", "enumerate", "give me"], label: "List" },
];

function detectTaskType(lazyPrompt: string): string | null {
  if (!lazyPrompt.trim()) return null;
  const lower = lazyPrompt.toLowerCase();
  for (const { keywords, label } of TASK_TYPE_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) return label;
  }
  return null;
}

interface RightPanelProps {
  promptTitle: string;
  generatedTitle?: string;
  promptContent: string;
  lazyPrompt: string;
  resolvedPromptType?: string;
  isStreaming: boolean;
  activeMessageId: string | null;
  onPublish: (messageId: string) => Promise<void>;
  isPublished?: boolean;
  isBookmarked?: boolean;
  onBookmark?: () => void;
  suggestions?: Suggestions | null;
  isSuggestingNext?: boolean;
  onStartPrompt?: (suggestion: string) => void;
  userInitial?: string;
  isTrial?: boolean;
}

/** Strip common markdown syntax so the text renders as clean prose. */
function stripMarkdown(text: string): string {
  return text
    // Fenced code blocks → just the inner text
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "$1")
    // Inline code
    .replace(/`([^`]+)`/g, "$1")
    // ATX headers (# ## ###)
    .replace(/^#{1,6}\s+/gm, "")
    // Bold + italic combined ***text***
    .replace(/\*{3}([^*]+)\*{3}/g, "$1")
    // Bold **text** or __text__
    .replace(/(\*{2}|_{2})([^*_]+)\1/g, "$2")
    // Italic *text* or _text_
    .replace(/(\*|_)([^*_]+)\1/g, "$2")
    // Blockquotes
    .replace(/^>\s+/gm, "")
    // Unordered list markers (-, *, +) → bullet char
    .replace(/^[ \t]*[-*+]\s+/gm, "• ")
    // Ordered list markers (1. 2.)
    .replace(/^[ \t]*\d+\.\s+/gm, "• ")
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Setext headers (underlined with === or ---)
    .replace(/^[=\-]{2,}\s*$/gm, "")
    // Links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Images ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Trailing whitespace on lines
    .replace(/[ \t]+$/gm, "")
    // Collapse 3+ blank lines into 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function RightPanel({
  promptTitle,
  generatedTitle = "",
  promptContent,
  lazyPrompt,
  resolvedPromptType = "standard",
  isStreaming,
  activeMessageId,
  onPublish,
  isPublished = false,
  isBookmarked = false,
  onBookmark,
  suggestions = null,
  isSuggestingNext = false,
  onStartPrompt,
  userInitial = "Y",
  isTrial = false,
}: RightPanelProps) {
  const [copied, setCopied] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleCopy = async () => {
    if (!promptContent) return;
    await navigator.clipboard.writeText(promptContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublish = async () => {
    if (!activeMessageId || isPublishing) return;
    setIsPublishing(true);
    try {
      await onPublish(activeMessageId);
    } finally {
      setIsPublishing(false);
    }
  };

  const taskType = detectTaskType(lazyPrompt);

  const hasRefined = !!promptContent || isStreaming;
  const hasDraft = !hasRefined && !!lazyPrompt.trim();
  const isEmpty = !hasRefined && !hasDraft;

  const titleFallback = generatedTitle
    || (lazyPrompt ? lazyPrompt.slice(0, 60) + (lazyPrompt.length > 60 ? "…" : "") : "Refined Prompt");
  const displayTitle =
    promptTitle && promptTitle !== "Refined Prompt"
      ? promptTitle
      : titleFallback;

  // Strip markdown from content so it renders as clean prose
  const displayContent = hasRefined
    ? stripMarkdown(promptContent)
    : lazyPrompt;

  return (
    <div className="flex flex-col h-full flex-1 min-w-0 relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground px-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm"
              style={{
                background:
                  "linear-gradient(135deg, rgba(49,219,165,0.15) 0%, rgba(28,76,138,0.15) 100%)",
                border: "1px solid rgba(49,219,165,0.2)",
              }}
            >
              ✨
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Your refined prompt will appear here
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Describe your prompt idea on the left and we'll help you improve it.
              </p>
            </div>
          </div>
        ) : (
          /* ── Prompt document view ── */
          <div className="px-8 py-7 w-full">

            {/* Title + badge row */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <h1 className="text-3xl font-bold text-foreground leading-tight tracking-tight">
                {displayTitle}
              </h1>
              <div className="shrink-0 mt-1.5">
                {isStreaming ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Refining…
                  </span>
                ) : hasDraft ? (
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground bg-muted/50">
                    Draft
                  </span>
                ) : null}
              </div>
            </div>

            {/* Properties */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <Layers className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-sm text-muted-foreground">Prompt type</span>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    color: "#1C4C8A",
                    backgroundColor: "rgba(28,76,138,0.08)",
                  }}
                >
                  {TYPE_LABELS[resolvedPromptType] ?? resolvedPromptType}
                </span>
              </div>

              {taskType && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-32 shrink-0">
                    <ListTodo className="h-4 w-4 text-muted-foreground/60" />
                    <span className="text-sm text-muted-foreground">Task type</span>
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      color: "#31DBA5",
                      backgroundColor: "rgba(49,219,165,0.1)",
                    }}
                  >
                    {taskType}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <User className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-sm text-muted-foreground">Created by</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: "#1C4C8A" }}
                  >
                    {userInitial}
                  </div>
                  <span className="text-sm text-foreground">You</span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border mb-6" />

            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">
                {hasDraft ? "Lazy Prompt" : "Prompt"}
              </span>
              {hasRefined && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onBookmark}
                    disabled={!activeMessageId}
                    className="flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ color: isBookmarked ? "#31DBA5" : undefined }}
                  >
                    <Bookmark
                      className="h-3.5 w-3.5"
                      fill={isBookmarked ? "#31DBA5" : "none"}
                    />
                    {isBookmarked ? "Bookmarked" : "Bookmark"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-sm font-medium transition-colors"
                    style={{ color: "#31DBA5" }}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </button>

                  {!isTrial && (
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={isPublishing || !activeMessageId || isStreaming}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={
                        isPublished
                          ? { background: "rgba(49,219,165,0.15)", color: "#31DBA5" }
                          : { background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)" }
                      }
                    >
                      {isPublishing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Publishing…
                        </>
                      ) : isPublished ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Published
                        </>
                      ) : (
                        <>
                          <Globe className="h-3.5 w-3.5" />
                          Publish to Community
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Content — clean prose, no markdown */}
            <div
              className="text-sm text-foreground leading-7 whitespace-pre-wrap"
              style={{ opacity: hasDraft ? 0.6 : 1 }}
            >
              {displayContent}
              {isStreaming && (
                <span
                  className="inline-block w-0.5 h-4 animate-pulse ml-0.5 align-middle rounded-full"
                  style={{ backgroundColor: "#31DBA5" }}
                />
              )}
            </div>

            {/* What's Next? */}
            {hasRefined && !isStreaming && (isSuggestingNext || suggestions) && (
              <div className="mt-10">
                <div className="border-t border-border mb-6" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                  What's next?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {isSuggestingNext && !suggestions ? (
                    /* Skeleton placeholders — mimic Try Next + Wild Card cards */
                    <>
                      {/* Try Next skeleton */}
                      <div className="rounded-xl border border-border p-4 flex flex-col gap-3 animate-pulse">
                        <div className="flex items-center gap-1.5">
                          <div className="h-3 w-3 rounded bg-[rgba(49,219,165,0.3)]" />
                          <div className="h-3 w-16 rounded bg-[rgba(49,219,165,0.3)]" />
                        </div>
                        <div className="space-y-1.5">
                          <div className="h-4 w-3/4 bg-muted rounded" />
                          <div className="h-3 w-full bg-muted rounded" />
                          <div className="h-3 w-5/6 bg-muted rounded" />
                        </div>
                        <div className="h-3 w-20 bg-[rgba(49,219,165,0.2)] rounded mt-auto" />
                      </div>
                      {/* Wild Card skeleton */}
                      <div className="rounded-xl border border-border p-4 flex flex-col gap-3 animate-pulse">
                        <div className="flex items-center gap-1.5">
                          <div className="h-3 w-3 rounded bg-[rgba(28,76,138,0.25)]" />
                          <div className="h-3 w-16 rounded bg-[rgba(28,76,138,0.25)]" />
                        </div>
                        <div className="space-y-1.5">
                          <div className="h-4 w-3/4 bg-muted rounded" />
                          <div className="h-3 w-full bg-muted rounded" />
                          <div className="h-3 w-5/6 bg-muted rounded" />
                        </div>
                        <div className="h-3 w-20 bg-[rgba(28,76,138,0.15)] rounded mt-auto" />
                      </div>
                    </>
                  ) : suggestions ? (
                    <>
                      {/* Try Next card */}
                      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-[rgba(49,219,165,0.4)] transition-colors group">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3" style={{ color: "#31DBA5" }} />
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#31DBA5" }}>
                            Try Next
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground leading-snug mb-1">
                            {suggestions.tryNext.title}
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {suggestions.tryNext.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onStartPrompt?.(suggestions.tryNext.suggestion)}
                          className="mt-auto flex items-center gap-1 text-xs font-medium transition-colors"
                          style={{ color: "#31DBA5" }}
                        >
                          Start Prompt
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Wild Card card */}
                      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-[rgba(28,76,138,0.4)] transition-colors group">
                        <div className="flex items-center gap-1.5">
                          <Shuffle className="h-3 w-3" style={{ color: "#1C4C8A" }} />
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#1C4C8A" }}>
                            Wild Card
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground leading-snug mb-1">
                            {suggestions.wildCard.title}
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {suggestions.wildCard.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onStartPrompt?.(suggestions.wildCard.suggestion)}
                          className="mt-auto flex items-center gap-1 text-xs font-medium transition-colors"
                          style={{ color: "#1C4C8A" }}
                        >
                          Start Prompt
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
