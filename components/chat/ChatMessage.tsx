"use client";

import { Copy, Check, Sparkles, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  messageId?: string;
  isPublic?: boolean;
  onMakePublic?: (messageId: string) => Promise<void>;
  isVerified?: boolean;
}

export function ChatMessage({
  role,
  content,
  messageId,
  isPublic = false,
  onMakePublic,
  isVerified = false,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [isMakingPublic, setIsMakingPublic] = useState(false);
  const { addToast } = useToast();

  const isUser = role === "user";
  
  // CRITICAL: Validate content to prevent "undefined" from appearing
  // If content is undefined, null, or the string "undefined", don't render
  const validContent = content && 
                       content !== 'undefined' && 
                       content !== 'null' &&
                       String(content).trim() !== '' 
                       ? String(content) 
                       : '';
  
  // Don't render if content is invalid
  if (!validContent) {
    return null;
  }

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

  const extractPromptFromCodeBlock = (content: string): string | null => {
    // First, try to find code blocks
    const codeBlockRegex = /```[\s\S]*?```/g;
    const matches = content.match(codeBlockRegex);
    if (matches && matches.length > 0) {
      // Return the first code block content (without the ``` markers)
      const codeContent = matches[0].replace(/```[\w]*\n?/g, '').trim();
      if (codeContent && codeContent.length > 10) {
        return codeContent;
      }
    }
    
    // If no code block found, extract from raw content after the heading
    // This handles cases where preprocessing hasn't wrapped it in code blocks yet
    const headingPattern = /(\*\*✨?\s*Your Optimized Prompt:\*\*|#+\s*✨?\s*Your Optimized Prompt:)/i;
    const headingMatch = content.match(headingPattern);
    if (headingMatch) {
      const headingIndex = headingMatch.index!;
      const headingLength = headingMatch[0].length;
      const afterHeading = content.slice(headingIndex + headingLength);
      
      // Find the end of the prompt text (next section marker)
      const endPattern = /\n\s*(\*\*Why This Works:\*\*|\*\*Best Used With:\*\*|\*\*💡 Tip:\*\*|#+\s+|---)/i;
      const endMatch = afterHeading.match(endPattern);
      const promptEndIndex = endMatch ? endMatch.index! : afterHeading.length;
      
      // Extract the prompt text
      const promptText = afterHeading.slice(0, promptEndIndex).trim();
      if (promptText && promptText.length > 10) {
        return promptText;
      }
    }
    
    return null;
  };

  // Check if content has optimized prompt heading - more robust detection
  const hasOptimizedPrompt = (content: string): boolean => {
    const lowerContent = content.toLowerCase();
    return content.includes("✨ Your Optimized Prompt") || 
           content.includes("Your Optimized Prompt") || 
           lowerContent.includes("optimized prompt") ||
           lowerContent.includes("your optimized prompt:");
  };

  // Preprocess content - ensure optimized prompt is wrapped in code blocks (same approach as PromptCard)
  const preprocessContent = (content: string): string => {
    if (!hasOptimizedPrompt(content)) {
      return content;
    }

    // Check if there's already a code block - if so, return as-is
    const codeBlockRegex = /```([\s\S]*?)```/;
    if (codeBlockRegex.test(content)) {
      return content; // Already has code block
    }

    // Find the heading
    const headingPattern = /(\*\*✨?\s*Your Optimized Prompt:\*\*|#+\s*✨?\s*Your Optimized Prompt:)/i;
    const headingMatch = content.match(headingPattern);
    if (!headingMatch) {
      return content;
    }

    const headingIndex = headingMatch.index!;
    const headingLength = headingMatch[0].length;
    const afterHeading = content.slice(headingIndex + headingLength);

    // Find the end of the prompt text (next section marker)
    const endPattern = /\n\s*(\*\*Why This Works:\*\*|\*\*Best Used With:\*\*|\*\*💡 Tip:\*\*|#+\s+|---)/i;
    const endMatch = afterHeading.match(endPattern);
    const promptEndIndex = endMatch ? endMatch.index! : afterHeading.length;

    // Extract the prompt text
    const promptText = afterHeading.slice(0, promptEndIndex).trim();
    
    if (!promptText) {
      return content;
    }

    // Wrap in code blocks (same as PromptCard approach)
    const beforeHeading = content.slice(0, headingIndex + headingLength);
    const afterPrompt = afterHeading.slice(promptEndIndex);
    
    return beforeHeading + '\n\n```\n' + promptText + '\n```\n' + afterPrompt;
  };

  const handleMakePublic = async () => {
    if (!messageId || !onMakePublic || isMakingPublic) return;
    setIsMakingPublic(true);
    try {
      await onMakePublic(messageId);
      addToast({
        title: "Success",
        description: isPublic
          ? "Prompt removed from library"
          : "Prompt shared to library",
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

  return (
    <div className="flex w-full py-4">
      <div
        className={cn(
          "w-full flex flex-col gap-2",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "break-words text-[15px] leading-[1.6]",
            isUser
              ? "px-4 py-3 bg-muted rounded-lg max-w-[85%]"
              : "w-full"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap m-0">{validContent}</p>
          ) : (
            <div className="w-full">
              {/* Show buttons above content if message has optimized prompt */}
              {/* Copy button shows immediately, Make Public shows when messageId is available */}
              {(() => {
                const hasPrompt = hasOptimizedPrompt(validContent);
                const promptText = extractPromptFromCodeBlock(validContent);
                
                if (!isUser && hasPrompt && promptText) {
                  return (
                    <div className="flex justify-end items-center gap-3 mb-3 pb-3">
                      {/* Copy Prompt button - always show if prompt is detected */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(promptText)}
                        className="!bg-background !border-border !text-foreground !rounded-xl !px-4 !py-2 !h-auto !text-sm font-medium shadow-sm hover:!bg-accent hover:!border-border transition-all duration-200"
                      >
                        {copied ? (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" strokeWidth={2} />
                            Copy Prompt
                          </>
                        )}
                      </Button>
                      {/* Share button - show always, disabled until messageId is available */}
                      {onMakePublic && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleMakePublic}
                          disabled={!messageId || isMakingPublic}
                          className="group !bg-gradient-to-r !from-[#1C4C8A] !to-[#31DBA5] !text-white !border-none !rounded-xl !px-4 !py-2 !h-auto !text-sm font-medium shadow-md hover:!shadow-lg hover:!scale-105 hover:!from-[#2a5aa3] hover:!to-[#3ddbb8] hover:!text-white disabled:!opacity-50 disabled:!cursor-not-allowed disabled:hover:!scale-100 transition-all duration-200"
                        >
                          <Sparkles className="mr-2 h-4 w-4 group-hover:!text-[#ffffff] group-hover:!drop-shadow-[0_0_4px_rgba(255,255,255,0.6)] transition-all duration-200" strokeWidth={2} />
                          {isPublic ? "Remove from Community" : "Share with Community"}
                        </Button>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
              <div className="prose prose-sm max-w-none">
              {/* Verified badge */}
              {isVerified && !isUser && (
                <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-green-50 rounded-md border border-green-200 w-fit">
                  <Shield className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-xs font-medium text-green-700">Verified</span>
                </div>
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Style code blocks - ChatGPT/Claude style container
                  code: ({ node, inline, className, children, ...props }: any) => {
                    // Check if this is a code block (not inline)
                    // For code blocks, inline is false and className is set (even if empty string)
                    const isCodeBlock = !inline;
                    const codeString = String(children).replace(/\n$/, "");
                    
                    if (isCodeBlock) {
                      return (
                        <div className="relative group my-4">
                          <div className="bg-[#f6f6f6] dark:bg-[#1e1e1e] rounded-lg overflow-hidden">
                            <pre className="px-4 py-4 overflow-x-auto m-0 bg-transparent">
                              <code className="block text-sm font-mono text-gray-950 dark:text-gray-100 leading-relaxed whitespace-pre-wrap break-words" {...props}>
                                {codeString}
                              </code>
                            </pre>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 bg-background/90 hover:bg-background border border-border shadow-sm rounded-md"
                                onClick={() => copyToClipboard(codeString)}
                              >
                                {copied ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-[0.9em] font-mono text-foreground" {...props}>
                        {children}
                      </code>
                    );
                  },
                  // Style links
                  a: ({ node, ...props }: any) => (
                    <a className="text-primary underline hover:text-[#31DBA5] dark:hover:text-[#31DBA5]" {...props} />
                  ),
                  // Style headings with Make Public and Copy buttons
                  h1: ({ node, children, ...props }: any) => {
                    // Extract text from React children
                    const getTextFromChildren = (children: any): string => {
                      if (typeof children === 'string') return children;
                      if (Array.isArray(children)) {
                        return children.map(getTextFromChildren).join('');
                      }
                      if (children?.props?.children) {
                        return getTextFromChildren(children.props.children);
                      }
                      return String(children || '');
                    };
                    const headingText = getTextFromChildren(children);
                    const isOptimizedPrompt = headingText.includes("✨ Your Optimized Prompt") || 
                                             headingText.includes("Your Optimized Prompt") ||
                                             headingText.toLowerCase().includes("optimized prompt");
                    const promptText = isOptimizedPrompt ? extractPromptFromCodeBlock(validContent) : null;
                    
                    return (
                      <div className="mt-4 mb-3 first:mt-0 relative">
                        {isOptimizedPrompt && promptText && !isUser && (
                          <div className="float-right ml-3 mb-2 flex items-center gap-3 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(promptText)}
                              className="!bg-background !border-border !text-foreground !rounded-xl !px-4 !py-2 !h-auto !text-sm font-medium shadow-sm hover:!bg-accent hover:!border-border transition-all duration-200"
                            >
                              {copied ? (
                                <>
                                  <Check className="mr-2 h-4 w-4" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-2 h-4 w-4" strokeWidth={2} />
                                  Copy Prompt
                                </>
                              )}
                            </Button>
                            {onMakePublic && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleMakePublic}
                                disabled={!messageId || isMakingPublic}
                                className="!bg-gradient-to-r !from-[#1C4C8A] !to-[#31DBA5] !text-white !border-none !rounded-xl !px-4 !py-2 !h-auto !text-sm font-medium shadow-md hover:!shadow-lg hover:!opacity-95 disabled:!opacity-50 disabled:!cursor-not-allowed transition-all duration-200"
                              >
                                <Sparkles className="mr-2 h-4 w-4" strokeWidth={2} />
                                {isPublic ? "Remove from Community" : "Share with Community"}
                              </Button>
                            )}
                          </div>
                        )}
                        <h1 className="font-[var(--font-space-grotesk)] font-bold text-xl" {...props}>
                          {children}
                        </h1>
                        <div className="clear-both"></div>
                      </div>
                    );
                  },
                  h2: ({ node, children, ...props }: any) => {
                    // Extract text from React children
                    const getTextFromChildren = (children: any): string => {
                      if (typeof children === 'string') return children;
                      if (Array.isArray(children)) {
                        return children.map(getTextFromChildren).join('');
                      }
                      if (children?.props?.children) {
                        return getTextFromChildren(children.props.children);
                      }
                      return String(children || '');
                    };
                    const headingText = getTextFromChildren(children);
                    const isOptimizedPrompt = headingText.includes("✨ Your Optimized Prompt") || 
                                             headingText.includes("Your Optimized Prompt") ||
                                             headingText.toLowerCase().includes("optimized prompt");
                    const promptText = isOptimizedPrompt ? extractPromptFromCodeBlock(validContent) : null;
                    
                    return (
                      <div className="mt-4 mb-3 first:mt-0 relative">
                        {isOptimizedPrompt && promptText && !isUser && (
                          <div className="float-right ml-3 mb-2 flex items-center gap-3 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(promptText)}
                              className="!bg-background !border-border !text-foreground !rounded-xl !px-4 !py-2 !h-auto !text-sm font-medium shadow-sm hover:!bg-accent hover:!border-border transition-all duration-200"
                            >
                              {copied ? (
                                <>
                                  <Check className="mr-2 h-4 w-4" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-2 h-4 w-4" strokeWidth={2} />
                                  Copy Prompt
                                </>
                              )}
                            </Button>
                            {onMakePublic && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleMakePublic}
                                disabled={!messageId || isMakingPublic}
                                className="!bg-gradient-to-r !from-[#1C4C8A] !to-[#31DBA5] !text-white !border-none !rounded-xl !px-4 !py-2 !h-auto !text-sm font-medium shadow-md hover:!shadow-lg hover:!opacity-95 disabled:!opacity-50 disabled:!cursor-not-allowed transition-all duration-200"
                              >
                                <Sparkles className="mr-2 h-4 w-4" strokeWidth={2} />
                                {isPublic ? "Remove from Community" : "Share with Community"}
                              </Button>
                            )}
                          </div>
                        )}
                        <h2 className="font-[var(--font-space-grotesk)] font-bold text-lg" {...props}>
                          {children}
                        </h2>
                        <div className="clear-both"></div>
                      </div>
                    );
                  },
                  h3: ({ node, children, ...props }: any) => {
                    // Extract text from React children
                    const getTextFromChildren = (children: any): string => {
                      if (typeof children === 'string') return children;
                      if (Array.isArray(children)) {
                        return children.map(getTextFromChildren).join('');
                      }
                      if (children?.props?.children) {
                        return getTextFromChildren(children.props.children);
                      }
                      return String(children || '');
                    };
                    const headingText = getTextFromChildren(children);
                    const isOptimizedPrompt = headingText.includes("✨ Your Optimized Prompt") || 
                                             headingText.includes("Your Optimized Prompt") ||
                                             headingText.toLowerCase().includes("optimized prompt");
                    const promptText = isOptimizedPrompt ? extractPromptFromCodeBlock(validContent) : null;
                    
                    return (
                      <div className="mt-4 mb-3 first:mt-0 relative">
                        {isOptimizedPrompt && promptText && !isUser && (
                          <div className="float-right ml-3 mb-2 flex items-center gap-3 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(promptText)}
                              className="!bg-background !border-border !text-foreground !rounded-xl !px-4 !py-2 !h-auto !text-sm font-medium shadow-sm hover:!bg-accent hover:!border-border transition-all duration-200"
                            >
                              {copied ? (
                                <>
                                  <Check className="mr-2 h-4 w-4" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-2 h-4 w-4" strokeWidth={2} />
                                  Copy Prompt
                                </>
                              )}
                            </Button>
                            {onMakePublic && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleMakePublic}
                                disabled={!messageId || isMakingPublic}
                                className="!bg-gradient-to-r !from-[#1C4C8A] !to-[#31DBA5] !text-white !border-none !rounded-xl !px-4 !py-2 !h-auto !text-sm font-medium shadow-md hover:!shadow-lg hover:!opacity-95 disabled:!opacity-50 disabled:!cursor-not-allowed transition-all duration-200"
                              >
                                <Sparkles className="mr-2 h-4 w-4" strokeWidth={2} />
                                {isPublic ? "Remove from Community" : "Share with Community"}
                              </Button>
                            )}
                          </div>
                        )}
                        <h3 className="font-[var(--font-space-grotesk)] font-bold text-base" {...props}>
                          {children}
                        </h3>
                        <div className="clear-both"></div>
                      </div>
                    );
                  },
                  // Style paragraphs
                  p: ({ node, ...props }: any) => (
                    <p className="mt-5 mb-3 last:mb-0 leading-relaxed" {...props} />
                  ),
                  // Style lists
                  ul: ({ node, ...props }: any) => (
                    <ul className="my-3 pl-6 list-disc list-outside" {...props} />
                  ),
                  ol: ({ node, ...props }: any) => (
                    <ol className="my-3 pl-6 list-decimal list-outside" {...props} />
                  ),
                  li: ({ node, ...props }: any) => (
                    <li className="my-1.5 pl-2" {...props} />
                  ),
                  // Style strong
                  strong: ({ node, ...props }: any) => (
                    <strong className="font-[var(--font-space-grotesk)] font-bold" {...props} />
                  ),
                }}
              >
                {preprocessContent(validContent)}
              </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
