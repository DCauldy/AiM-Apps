"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { StreamingMessage } from "./StreamingMessage";
import { ChatInput } from "./ChatInput";
import type { ChatMessage as ChatMessageType, PromptType } from "@/types";

interface ChatWindowProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSend: (message: string, promptType?: PromptType) => void;
  onMakePublic?: (messageId: string) => Promise<void>;
  threadId?: string;
  initialValue?: string;
}

export function ChatWindow({
  messages,
  isLoading,
  onSend,
  onMakePublic,
  threadId,
  initialValue,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPromptType, setSelectedPromptType] = useState<PromptType>("auto");
  const [mounted, setMounted] = useState(false);
  
  // Track mounted state to prevent hydration mismatches
  // This ensures server and client render the same initial state
  useEffect(() => {
    setMounted(true);
  }, []);
  
  const userHasScrolledUp = useRef(false);
  const shouldAutoScroll = useRef(true);

  // Check if user is near the bottom of the scroll container
  const isNearBottom = () => {
    if (!scrollRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Consider "near bottom" if within 100px of the bottom
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // Handle scroll events to track if user has scrolled up
  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        shouldAutoScroll.current = isNearBottom();
        userHasScrolledUp.current = !shouldAutoScroll.current;
      }
    };

    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
      return () => scrollElement.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Track if this is the initial load to force scroll to bottom
  const isInitialLoadRef = useRef(true);
  const hasScrolledToBottomRef = useRef(false);
  const lastMessageCountRef = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(false);
  
  // Force scroll to bottom function with retry logic
  const scrollToBottom = (force = false) => {
    if (!scrollRef.current) return;
    
    // Clear any pending scroll
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Use multiple attempts to ensure scroll happens after DOM renders
    const attemptScroll = (attempt = 0, maxAttempts = 8) => {
      if (!scrollRef.current || attempt >= maxAttempts) {
        if (scrollRef.current && attempt >= maxAttempts) {
          // Max attempts reached, force scroll anyway
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        hasScrolledToBottomRef.current = true;
        shouldAutoScroll.current = true;
        userHasScrolledUp.current = false;
        return;
      }
      
      const currentScrollHeight = scrollRef.current.scrollHeight;
      scrollRef.current.scrollTop = currentScrollHeight;
      
      // Verify we actually scrolled to bottom (within 5px tolerance)
      const scrolledToBottom = Math.abs(
        scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight
      ) < 5;
      
      if (!scrolledToBottom) {
        // Try again after a short delay, with exponential backoff
        const delay = Math.min(50 * Math.pow(1.5, attempt), 300);
        scrollTimeoutRef.current = setTimeout(() => attemptScroll(attempt + 1, maxAttempts), delay);
      } else {
        // Successfully scrolled
        hasScrolledToBottomRef.current = true;
        shouldAutoScroll.current = true;
        userHasScrolledUp.current = false;
      }
    };
    
    // Start scrolling immediately
    requestAnimationFrame(() => {
      attemptScroll();
    });
  };
  
  // Mark as mounted after first render
  useEffect(() => {
    mountedRef.current = true;
  }, []);
  
  // Use MutationObserver to detect when messages are added to DOM and scroll to bottom
  // This is a backup mechanism to catch any cases where messages render after our useEffect
  // CRITICAL: Also scroll during streaming to follow the content as it streams
  useEffect(() => {
    if (!scrollRef.current || !mountedRef.current || messages.length === 0) return;
    
    let scrollTimeout: NodeJS.Timeout | null = null;
    let lastScrollHeight = 0;
    let lastContentLength = 0;
    
    const observer = new MutationObserver(() => {
      if (!scrollRef.current) return;
      
      const currentScrollHeight = scrollRef.current.scrollHeight;
      // Also check content length changes (for streaming updates within existing elements)
      const lastMessage = messages[messages.length - 1];
      const currentContentLength = lastMessage?.content?.length || 0;
      
      // Scroll if height changed OR content length changed (streaming updates)
      const heightChanged = currentScrollHeight !== lastScrollHeight && currentScrollHeight > 0;
      const contentChanged = isLoading && currentContentLength !== lastContentLength && currentContentLength > lastContentLength;
      
      if (heightChanged || contentChanged) {
        lastScrollHeight = currentScrollHeight;
        lastContentLength = currentContentLength;
        
        // Clear any pending scroll
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        
        // CRITICAL: During streaming (isLoading), always scroll to bottom to follow content
        // Also scroll if we haven't scrolled to bottom yet (initial load)
        if (isLoading || !hasScrolledToBottomRef.current || shouldAutoScroll.current) {
          // During streaming, scroll immediately with minimal delay
          const delay = isLoading ? 10 : 50;
          scrollTimeout = setTimeout(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              hasScrolledToBottomRef.current = true;
              shouldAutoScroll.current = true;
              userHasScrolledUp.current = false;
            }
          }, delay);
        }
      }
    });
    
    // Observe the scroll container for child changes AND character data changes (for streaming)
    if (scrollRef.current) {
      observer.observe(scrollRef.current, {
        childList: true,
        subtree: true,
        characterData: true, // Watch for text content changes during streaming
        attributes: true,
        attributeFilter: ['style', 'class'], // Watch for style/class changes that might affect layout
      });
    }
    
    return () => {
      observer.disconnect();
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [messages.length, isLoading, messages]);
  
  // Additional scroll watcher specifically for streaming content updates
  useEffect(() => {
    if (!scrollRef.current || !isLoading || messages.length === 0) return;
    
    // Get the last message content length to detect changes
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return;
    
    // Set up an interval to check for content changes during streaming
    const scrollInterval = setInterval(() => {
      if (scrollRef.current && shouldAutoScroll.current && !userHasScrolledUp.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100); // Check every 100ms during streaming
    
    return () => {
      clearInterval(scrollInterval);
    };
  }, [isLoading, messages]);
  
  // Track previous count for scroll detection
  const previousCountRef = useRef(0);
  
  // Auto-scroll to bottom on initial load, when loading, or if user is near bottom
  useEffect(() => {
    // Only run after component is mounted
    if (!mountedRef.current) return;
    
    const previousCount = previousCountRef.current;
    const messageCountChanged = messages.length !== previousCount;
    previousCountRef.current = messages.length;
    lastMessageCountRef.current = messages.length;
    
    // CRITICAL: When messages first appear (0 to many), ALWAYS scroll to bottom
    // This handles: page refresh, thread load, database load, sessionStorage restore
    if (previousCount === 0 && messages.length > 0) {
      // Messages just appeared - force scroll to bottom with multiple attempts
      isInitialLoadRef.current = false;
      hasScrolledToBottomRef.current = false;
      
      // Use multiple timeouts to ensure scroll happens after DOM renders
      // More aggressive timing to catch all rendering scenarios
      const scrollAttempts = [0, 50, 100, 200, 400, 600, 800];
      scrollAttempts.forEach((delay, index) => {
        setTimeout(() => {
          if (scrollRef.current) {
            // Force scroll to maximum
            const maxScroll = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
            scrollRef.current.scrollTop = Math.max(maxScroll, scrollRef.current.scrollHeight);
            
            // On the last attempt, mark as scrolled
            if (index === scrollAttempts.length - 1) {
              hasScrolledToBottomRef.current = true;
              shouldAutoScroll.current = true;
              userHasScrolledUp.current = false;
            }
          }
        }, delay);
      });
    }
    // Always auto-scroll when loading (streaming new message) - this is critical for following streaming content
    // Or if user hasn't scrolled up (they're at the bottom)
    if (scrollRef.current && messages.length > 0 && (isLoading || shouldAutoScroll.current || !userHasScrolledUp.current)) {
      // During streaming, scroll more aggressively to follow content
      if (isLoading) {
        // Use immediate scroll for streaming to keep up with content
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      } else {
        scrollToBottom();
      }
    }
    
    // Reset when messages are cleared
    if (messages.length === 0) {
      lastMessageCountRef.current = 0;
      previousCountRef.current = 0;
      hasScrolledToBottomRef.current = false;
    }
  }, [messages.length, isLoading]);
  
  // Reset initial load flag when threadId changes (new conversation)
  useEffect(() => {
    if (threadId) {
      isInitialLoadRef.current = true;
      hasScrolledToBottomRef.current = false;
      lastMessageCountRef.current = 0;
      previousCountRef.current = 0;
      // Clear any pending scrolls
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    }
  }, [threadId]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Handle Cmd+A / Ctrl+A to select all text when not in textarea
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+A (Mac) or Ctrl+A (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        // CRITICAL: Check multiple ways to detect if we're in an input/textarea
        // This must be done BEFORE any preventDefault to allow native select-all
        const activeElement = document.activeElement;
        const target = e.target as HTMLElement;
        
        // Check if active element is directly an input or textarea
        const isActiveInput = 
          activeElement?.tagName === 'INPUT' || 
          activeElement?.tagName === 'TEXTAREA';
        
        // Check if target is within an input/textarea (handles nested elements)
        const isTargetInInput = target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.closest('input') !== null ||
          target.closest('textarea') !== null ||
          target.closest('[contenteditable="true"]') !== null
        );
        
        // Check if it's content editable
        const isContentEditable = 
          (activeElement instanceof HTMLElement && activeElement.isContentEditable) ||
          (target?.isContentEditable === true);
        
        // If ANY of these checks indicate we're in an input/textarea, DO NOTHING
        // Allow the browser's native select-all to work
        if (isActiveInput || isTargetInInput || isContentEditable) {
          return; // Exit immediately - let browser handle select-all in textarea
        }
        
        // Only handle if NOT in any input/textarea and we have a scroll container
        if (scrollRef.current) {
          // Select all text in the messages area (outside of any inputs)
          e.preventDefault();
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(scrollRef.current);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }
    };

    // Use capture: false so the textarea gets the event first
    // Our handler checks if we're in a textarea and exits early if so
    window.addEventListener('keydown', handleKeyDown, false);
    return () => window.removeEventListener('keydown', handleKeyDown, false);
  }, []);

  // Use mounted state to prevent hydration mismatch
  // On server, messages is always empty, so we render empty state
  // On client, we need to match the server's initial render to avoid hydration errors
  // After mount, we can safely show the actual messages state
  const isEmpty = messages.length === 0;
  // Show empty state if: (1) messages are empty, OR (2) not mounted yet (matches server render)
  const showEmptyState = !mounted ? true : isEmpty;

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-background">
      {showEmptyState ? (
        // Positioned layout for empty state - higher up to avoid cutoff
        <div className="flex-1 flex flex-col items-center overflow-y-auto min-h-0 pt-12 sm:pt-16 md:pt-20 pb-16 sm:pb-20 px-4 sm:px-8">
          <div className="w-full max-w-2xl space-y-6">
            {/* Welcome text */}
            <div className="text-center space-y-3 sm:space-y-4">
              <h2 className="text-2xl sm:text-4xl font-[var(--font-space-grotesk)] font-bold text-foreground leading-tight">
                Say it simply. Prompt it perfectly.
              </h2>
              <p className="text-sm sm:text-base text-foreground opacity-70 leading-relaxed">
                Engineer ideas into optimized AI prompts—plus access to a shared library of prompts created by the AiM community.
              </p>
            </div>
            
            {/* Centered input with space for dropdown */}
            <div className="flex justify-center pb-4">
              <ChatInput
                onSend={(message, promptType) => onSend(message, promptType)}
                disabled={isLoading}
                promptType={selectedPromptType}
                onPromptTypeChange={setSelectedPromptType}
                initialValue={initialValue}
                centered={true}
              />
            </div>
          </div>
        </div>
      ) : (
        // Normal layout with messages and bottom input - ChatGPT/Claude style
        <>
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 chat-messages"
          >
            <div className="flex flex-col items-center">
              <div className="w-full max-w-4xl px-4">
                {(() => {
                  // Filter out system messages
                  const filteredMessages = messages.filter((msg) => msg.role !== "system");
                  
                  
                  // When loading and the last message is an assistant message WITHOUT an ID, exclude it from the list
                  // (it will be shown as StreamingMessage instead)
                  // Once messageId is set (streaming completes), include it so buttons show
                  const lastMessage = filteredMessages[filteredMessages.length - 1];
                  const shouldExcludeLastMessage = isLoading && 
                    lastMessage?.role === "assistant" &&
                    !lastMessage?.id; // Only exclude if no ID yet
                  
                  
                  const messagesToRender = shouldExcludeLastMessage
                    ? filteredMessages.slice(0, -1)
                    : filteredMessages;
                  
                  
                  return messagesToRender.map((message, index) => {
                    return (
                      <ChatMessage
                        key={message.id ? `msg-${message.id}` : `msg-${index}-${message.content.slice(0, 20)}`}
                        role={message.role as "user" | "assistant"}
                        content={message.content}
                        messageId={message.id}
                        isPublic={message.is_public}
                        onMakePublic={onMakePublic}
                        isVerified={message.is_verified}
                      />
                    );
                  });
                })()}
                {isLoading && (
                  <>
                    {(() => {
                      const lastMessage = messages[messages.length - 1];
                      // CRITICAL: Validate content to prevent "undefined" from appearing
                      const messageContent = lastMessage?.content;
                      const isValidContent = messageContent && 
                                           messageContent !== 'undefined' && 
                                           messageContent !== 'null' &&
                                           typeof messageContent === 'string' &&
                                           messageContent.trim() !== '';
                      const hasAssistantMessage = lastMessage?.role === "assistant" && isValidContent;
                      const hasNoId = !lastMessage?.id;
                      
                      
                      // Only show StreamingMessage if we have an assistant message without an ID and valid content
                      // Once ID is set, the message will be in messagesToRender above as ChatMessage
                      if (hasAssistantMessage && hasNoId) {
                        return (
                          <StreamingMessage
                            key={`streaming-${String(messageContent).slice(0, 20)}`}
                            content={String(messageContent)}
                            messageId={undefined} // No ID yet during streaming
                            onMakePublic={onMakePublic}
                          />
                        );
                      }
                      
                      
                      // Show loading dots if no assistant message yet
                      return (
                        <div className="flex w-full py-4">
                          <div className="flex items-center gap-1 px-4 py-2">
                            <div className="typing-dot"></div>
                            <div className="typing-dot"></div>
                            <div className="typing-dot"></div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-center bg-background pt-4 pb-4">
            <div className="w-full max-w-4xl px-4">
              <ChatInput
                onSend={(message, promptType) => onSend(message, promptType)}
                disabled={isLoading}
                promptType={selectedPromptType}
                onPromptTypeChange={setSelectedPromptType}
                initialValue={initialValue}
                centered={false}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

