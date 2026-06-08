"use client";

import type { ReactNode, RefObject } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type OnboardingChatFrameProps = {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
};

export function OnboardingChatFrame({
  children,
  className,
  containerClassName,
}: OnboardingChatFrameProps) {
  return (
    <div className={cn("container max-w-3xl mx-auto px-4 py-8", containerClassName)}>
      <div
        className={cn(
          "rounded-lg border border-border bg-card overflow-hidden flex flex-col h-[600px]",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

type OnboardingChatHeaderProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
};

export function OnboardingChatHeader({
  icon,
  title,
  description,
}: OnboardingChatHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
      {icon}
      <div className="flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

type ChatMessageListProps = {
  children: ReactNode;
  scrollRef?: RefObject<HTMLDivElement>;
  className?: string;
};

export function ChatMessageList({ children, scrollRef, className }: ChatMessageListProps) {
  return (
    <div ref={scrollRef} className={cn("flex-1 overflow-y-auto px-4 py-4 space-y-3", className)}>
      {children}
    </div>
  );
}

type ChatBubbleProps = {
  role: "user" | "assistant";
  children: ReactNode;
  userClassName?: string;
  assistantClassName?: string;
  showAvatar?: boolean;
  accentClassName?: string;
  assistantAvatarClassName?: string;
};

export function ChatBubble({
  role,
  children,
  userClassName,
  assistantClassName,
  showAvatar = false,
  accentClassName,
  assistantAvatarClassName,
}: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      {/* max-w lives on the row wrapper, not the bubble — putting it on the
          bubble computes the percentage against this shrink-to-content row
          and collapses the bubble to its longest word. */}
      <div
        className={cn(
          "flex items-start gap-2 max-w-[85%]",
          isUser && "flex-row-reverse",
        )}
      >
        {showAvatar && (
          <div
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5",
              isUser ? "bg-primary/10" : assistantAvatarClassName ?? "bg-muted"
            )}
          >
            {isUser ? (
              <User className={cn("h-3.5 w-3.5", accentClassName ?? "text-primary")} />
            ) : (
              <Bot className={cn("h-3.5 w-3.5", accentClassName)} />
            )}
          </div>
        )}
        <div
          className={cn(
            "px-3 py-2",
            isUser
              ? "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-2xl rounded-tl-sm bg-muted",
            isUser ? userClassName : assistantClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type TypingIndicatorProps = {
  variant?: "dots" | "spinner";
  label?: string;
  className?: string;
};

export function TypingIndicator({
  variant = "dots",
  label = "Thinking…",
  className,
}: TypingIndicatorProps) {
  if (variant === "spinner") {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground px-2", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        {label}
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg px-4 py-3 bg-card border", className)}>
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  buttonClassName?: string;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = "Type your reply…",
  buttonClassName,
}: ChatComposerProps) {
  return (
    <>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
        className="text-sm resize-none"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className={buttonClassName}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" /> Send
        </Button>
      </div>
    </>
  );
}
