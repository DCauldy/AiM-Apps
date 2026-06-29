"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Send, Loader2, Bot, User, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BofuBlog, BofuBlogChat } from "@/types/blog-engine";

interface RefinementChatProps {
  blog: BofuBlog;
  existingChats: BofuBlogChat[];
  onBlogUpdated: () => void;
}

/** Extract all text content from a UIMessage's parts. */
function getMessageText(message: UIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function RefinementChat({
  blog,
  existingChats,
  onBlogUpdated,
}: RefinementChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isLimitReached = blog.refinements_used >= blog.refinements_limit;

  // Convert existing chats to initial UIMessages
  const initialMessages: UIMessage[] = existingChats.map((chat, index) => ({
    id: chat.id || `chat-${index}`,
    role: chat.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: chat.content }],
  }));

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: `/api/apps/blog-engine/blogs/${blog.id}/refine`,
      }),
    [blog.id]
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: initialMessages,
    onFinish: () => {
      onBlogUpdated();
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const remainingRefinements =
    blog.refinements_limit - blog.refinements_used - (isLoading ? 1 : 0);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || isLimitReached) return;
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-card/50 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">
          Refinement Chat
        </h3>
        <span
          className={cn(
            "text-xs",
            remainingRefinements <= 1
              ? "text-amber-500"
              : "text-muted-foreground"
          )}
        >
          {Math.max(0, remainingRefinements)} of {blog.refinements_limit}{" "}
          remaining
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages.length === 0 && !isLimitReached && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              Ask me to make changes to your blog.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Example: &quot;Make the intro more conversational&quot; or
              &quot;Add a section about closing costs&quot;
            </p>
          </div>
        )}

        {messages.map((message) => {
          const text = getMessageText(message);

          return (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "flex items-start gap-2 max-w-[90%]",
                  message.role === "user" && "flex-row-reverse"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5",
                    message.role === "user"
                      ? "bg-primary/10"
                      : "bg-[#31DBA5]/10"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="h-3 w-3 text-primary" />
                  ) : (
                    <Bot className="h-3 w-3 text-[#31DBA5]" />
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border text-foreground"
                  )}
                >
                  <span className="whitespace-pre-wrap">{text}</span>
                </div>
              </div>
            </div>
          );
        })}

        {status === "submitted" && (
          <div className="flex justify-start">
            <div className="flex items-start gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#31DBA5]/10 shrink-0">
                <Bot className="h-3 w-3 text-[#31DBA5]" />
              </div>
              <div className="rounded-lg px-3 py-2 bg-card border">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3 bg-card/50">
        {isLimitReached ? (
          <div className="flex items-center gap-2 justify-center py-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span>
              All {blog.refinements_limit} refinements used. Copy the blog to
              your own tools for further editing.
            </span>
          </div>
        ) : (
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Request a change..."
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                "min-h-[38px] max-h-[100px]"
              )}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
