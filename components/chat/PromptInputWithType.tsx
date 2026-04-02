"use client";

import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputHeader,
  PromptInputButton,
} from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Sparkles, Brain, Search, User, Video, Mic, Image, Wand2 } from "lucide-react";
import type { PromptType } from "@/types";
import { cn } from "@/lib/utils";
import { useRef, useEffect } from "react";

// Send icon matching ChatInput styling
const SendIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 7v10M8 11l4-4 4 4" />
  </svg>
);

interface PromptInputWithTypeProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: string, promptType?: PromptType) => void;
  promptType: PromptType;
  onPromptTypeChange?: (type: PromptType) => void;
  disabled?: boolean;
  placeholder?: string;
  centered?: boolean;
  showPromptTypeSelector?: boolean;
}

const promptTypes: { value: PromptType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "auto", label: "Auto Detect", icon: <Wand2 className="h-4 w-4" />, description: "AI detects the best prompt type for you" },
  { value: "standard", label: "Standard Prompt", icon: <Sparkles className="h-4 w-4" />, description: "Recommended for most tasks" },
  { value: "reasoning", label: "Reasoning Prompt", icon: <Brain className="h-4 w-4" />, description: "For reasoning tasks (GPT-5 model)" },
  { value: "deep-research", label: "Deep Research Prompt", icon: <Search className="h-4 w-4" />, description: "For web-based research" },
  { value: "custom-gpt", label: "Custom GPT/Agent Prompt", icon: <User className="h-4 w-4" />, description: "Design your own Custom GPTs or AI Agents" },
  { value: "video", label: "Video Prompt", icon: <Video className="h-4 w-4" />, description: "Create prompts for Veo, Kling/Motion, Runway, Pika, and more" },
  { value: "voice", label: "Voice/Audio Prompt", icon: <Mic className="h-4 w-4" />, description: "Create prompts for Eleven Labs, TTS, and voice generation" },
  { value: "image", label: "Image Prompt", icon: <Image className="h-4 w-4" />, description: "Create prompts for Google Nano Banana, Nano Banana Pro, and ChatGPT Image 1.5" },
];

export function PromptInputWithType({
  value,
  onChange,
  onSubmit,
  promptType,
  onPromptTypeChange,
  disabled = false,
  placeholder = "Message...",
  centered = false,
  showPromptTypeSelector = false,
}: PromptInputWithTypeProps) {
  const currentPromptType = promptTypes.find((pt) => pt.value === promptType) || promptTypes[0];
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = "auto";
      // Get the scroll height
      const scrollHeight = textareaRef.current.scrollHeight;
      // Set max height (200px as per className)
      const maxHeight = 200;
      // Set the height, respecting the max height
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + "px";
    }
  }, [value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSubmit(value.trim(), promptType);
      onChange("");
    }
  };

  return (
    <div className={cn("w-full", centered && "flex justify-center")}>
      <div className={cn("w-full", centered ? "max-w-2xl" : "max-w-4xl")}>
        <form onSubmit={handleSubmit} className="w-full">
          <div className="flex gap-2 items-center w-full relative">
            <div className="flex-1 border border-border rounded-2xl bg-background shadow-sm hover:shadow-md transition-shadow focus-within:border-border focus-within:shadow-md min-h-[36px] flex items-center px-2 overflow-visible relative">
              {showPromptTypeSelector && onPromptTypeChange && (
                <div className="order-first flex-wrap gap-1 p-0 m-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      type="button"
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                      disabled={disabled}
                    >
                      {currentPromptType.icon}
                      <span className="hidden sm:inline">{currentPromptType.label}</span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {promptTypes.map((type) => (
                        <DropdownMenuItem
                          key={type.value}
                          onClick={() => onPromptTypeChange(type.value)}
                          className="flex items-start gap-2"
                        >
                          <div className="mt-0.5">{type.icon}</div>
                          <div className="flex flex-col">
                            <span className="font-medium">{type.label}</span>
                            <span className="text-xs text-muted-foreground">{type.description}</span>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                className="flex-1 px-2 py-2.5 bg-transparent text-foreground resize-none font-sans text-[15px] leading-[1.4] max-h-[200px] focus:outline-none placeholder:text-muted-foreground caret-primary min-h-[24px] border-0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (value.trim() && !disabled) {
                      handleSubmit(e);
                    }
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="!border-none !rounded-full !w-9 !h-9 !min-w-9 !p-0 !m-0 !flex !items-center !justify-center transition-all shrink-0 !bg-transparent hover:!bg-accent !text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Voice input"
              disabled={disabled}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={disabled || !value.trim()}
              className="!bg-[#1C4C8A] !text-white !border-none !rounded-lg !w-9 !h-9 !min-w-9 !p-0 !m-0 !flex !items-center !justify-center hover:!bg-[#183f73] disabled:!opacity-40 disabled:!cursor-not-allowed transition-all shrink-0"
            >
              <SendIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
