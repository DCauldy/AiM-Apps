"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StreamingMessageProps {
  content: string;
  messageId?: string;
  onMakePublic?: (messageId: string) => Promise<void>;
}

// Helper function to detect prompt generation
function detectPromptGeneration(content: string): boolean {
  if (!content || content.length < 20) {
    return false;
  }
  
  const hasPromptHeading =
    content.includes("✨ Your Optimized Prompt") ||
    content.includes("Your Optimized Prompt:") ||
    /#+\s*✨?\s*Your Optimized Prompt:/i.test(content) ||
    /\*\*✨?\s*Your Optimized Prompt:\*\*/i.test(content);
  
  return hasPromptHeading && content.length > 50;
}

// Loading indicator component
function LoadingDots() {
  return (
    <div className="flex items-center gap-1">
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
    </div>
  );
}

// Prompt generation loading UI
function PromptGenerationLoading() {
  return (
    <>
      <div className="flex items-center gap-2 text-[#2D323C] opacity-70 mb-4 animate-fade-in">
        <LoadingDots />
        <span className="text-sm font-medium">Creating your prompt...</span>
      </div>
      <div className="w-full mb-4">
        <div className="bg-muted border border-border rounded-lg p-6 animate-pulse">
          <div className="space-y-3">
            <div className="h-4 bg-muted-foreground/20 rounded w-3/4"></div>
            <div className="h-4 bg-muted-foreground/20 rounded w-full"></div>
            <div className="h-4 bg-muted-foreground/20 rounded w-5/6"></div>
            <div className="h-4 bg-muted-foreground/20 rounded w-4/5 mt-4"></div>
            <div className="h-4 bg-muted-foreground/20 rounded w-full"></div>
          </div>
        </div>
      </div>
    </>
  );
}

// Regular conversation loading UI
function RegularLoadingIndicator() {
  return (
    <div className="flex items-center gap-2 text-[#2D323C] opacity-70">
      <LoadingDots />
    </div>
  );
}

export function StreamingMessage({
  content,
  messageId,
  onMakePublic,
}: StreamingMessageProps) {
  const [copied, setCopied] = useState(false);
  const [isMakingPublic, setIsMakingPublic] = useState(false);
  const { addToast } = useToast();

  // Normalize and validate content
  const normalizedContent = content && 
    content !== 'undefined' && 
    content !== 'null' &&
    String(content).trim() !== '' 
    ? String(content) 
    : '';
  
  
  // Early return for invalid content
  if (!normalizedContent) {
    return null;
  }

  // Determine rendering state
  const isStreaming = !messageId;
  const isPromptGen = isStreaming && detectPromptGeneration(normalizedContent);

  // Handler for making message public
  const handleMakePublic = async () => {
    if (!messageId || !onMakePublic || isMakingPublic) return;
    setIsMakingPublic(true);
    try {
      await onMakePublic(messageId);
      addToast({
        title: "Success",
        description: "Prompt shared to library",
      });
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to update prompt",
        variant: "destructive",
      });
    } finally {
      setIsMakingPublic(false);
    }
  };

  // Handler for copying to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      addToast({
        title: "Copied!",
        description: "Prompt copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      addToast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  // Render streaming content with loading indicator
  if (isStreaming) {
    // If we have content, show it as it streams
    if (normalizedContent && normalizedContent.length > 0) {
      return (
        <div className="flex w-full py-4">
          <div className="w-full max-w-4xl mx-auto px-4">
            <div className="flex gap-4">
              {/* Avatar */}
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#1C4C8A] flex items-center justify-center">
                  <span className="text-white text-sm font-bold">A</span>
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ node, ...props }: any) => (
                        <p className="mt-2 mb-2 last:mb-0 leading-relaxed text-[#2D323C]" {...props} />
                      ),
                      h1: ({ node, ...props }: any) => (
                        <h1 className="text-xl font-bold mt-4 mb-2 text-[#2D323C]" {...props} />
                      ),
                      h2: ({ node, ...props }: any) => (
                        <h2 className="text-lg font-bold mt-3 mb-2 text-[#2D323C]" {...props} />
                      ),
                      h3: ({ node, ...props }: any) => (
                        <h3 className="text-base font-bold mt-2 mb-2 text-[#2D323C]" {...props} />
                      ),
                      ul: ({ node, ...props }: any) => (
                        <ul className="my-2 pl-6 list-disc list-outside" {...props} />
                      ),
                      ol: ({ node, ...props }: any) => (
                        <ol className="my-2 pl-6 list-decimal list-outside" {...props} />
                      ),
                      li: ({ node, ...props }: any) => (
                        <li className="my-1 pl-2 text-[#2D323C]" {...props} />
                      ),
                      code: ({ node, inline, ...props }: any) => {
                        if (inline) {
                          return (
                            <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground" {...props} />
                          );
                        }
                        return (
                          <code className="block bg-muted border border-border rounded-lg p-4 overflow-x-auto text-sm font-mono text-foreground" {...props} />
                        );
                      },
                      pre: ({ node, ...props }: any) => (
                        <pre className="bg-muted border border-border rounded-lg p-4 overflow-x-auto my-2" {...props} />
                      ),
                    }}
                  >
                    {normalizedContent}
                  </ReactMarkdown>
                </div>
                {/* Show loading indicator below content while streaming */}
                <div className="flex items-center gap-2 text-[#2D323C] opacity-70 mt-3">
                  <LoadingDots />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // No content yet, show loading state
    return (
      <div className="flex w-full py-4">
        <div className="w-full flex flex-col gap-2 items-start">
          {isPromptGen ? <PromptGenerationLoading /> : <RegularLoadingIndicator />}
        </div>
      </div>
    );
  }

  // Should not render after streaming completes (handled by ChatMessage)
  return null;
}
