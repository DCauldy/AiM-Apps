"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
} from "@/components/ai-elements/message";
import { PromptInputWithType } from "./PromptInputWithType";
import { ChatInput } from "./ChatInput";
import { Copy, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import type { ChatMessage as ChatMessageType, PromptType } from "@/types";

interface ChatWindowAIElementsProps {
  messages: ChatMessageType[] | any[]; // Accept messages in any format (ChatMessage or UIMessage from useChat)
  isLoading: boolean;
  onSend: (message: string, promptType?: PromptType) => void;
  onMakePublic?: (messageId: string) => Promise<void>;
  threadId?: string;
  promptType?: PromptType;
  onPromptTypeChange?: (type: PromptType) => void;
}

// Helper function to detect if a message contains an optimized prompt
function hasOptimizedPrompt(content: string): boolean {
  if (!content) return false;
  const lowerContent = content.toLowerCase();
  return content.includes("✨ Your Optimized Prompt") || 
         content.includes("Your Optimized Prompt") || 
         lowerContent.includes("optimized prompt") ||
         lowerContent.includes("your optimized prompt:");
}

export function ChatWindowAIElements({
  messages,
  isLoading,
  onSend,
  onMakePublic,
  threadId,
  promptType = "auto",
  onPromptTypeChange,
}: ChatWindowAIElementsProps) {
  const [selectedPromptType, setSelectedPromptType] = useState<PromptType>(promptType);
  const [inputValue, setInputValue] = useState("");
  const [makingPublic, setMakingPublic] = useState<Set<string>>(new Set());
  const { addToast } = useToast();
  
  // Update selectedPromptType when prop changes
  useEffect(() => {
    if (promptType) {
      setSelectedPromptType(promptType);
    }
  }, [promptType]);


  // Convert messages to a consistent format
  // Handle both ChatMessage format (with content) and CoreMessage format (with parts)
  const normalizedMessages = useMemo(() => {
    const seenIds = new Set<string>();
    const converted = messages
      .map((msg, index) => {
        let content = '';
        let role = msg.role;
        
        // Check if it's a CoreMessage (has parts)
        if ('parts' in msg && Array.isArray(msg.parts)) {
          const textParts = msg.parts.filter((p: any) => p.type === 'text');
          // Extract text from all text parts and join them
          content = textParts.map((p: any) => {
            // Handle both string and object formats
            if (typeof p.text === 'string') {
              return p.text;
            }
            // Sometimes text might be nested
            if (p.text && typeof p.text === 'object' && 'text' in p.text) {
              return p.text.text || '';
            }
            return '';
          }).join('') || '';
          
        } else {
          // Otherwise it's a ChatMessage (has content)
          content = (msg as ChatMessageType).content || '';
        }
        
        return {
          id: msg.id,
          role: role,
          content: content,
          is_public: (msg as ChatMessageType).is_public,
          is_verified: (msg as ChatMessageType).is_verified,
        };
      })
      .filter((msg) => {
        // Deduplicate messages by ID
        if (msg.id && seenIds.has(msg.id)) {
          return false;
        }
        if (msg.id) {
          seenIds.add(msg.id);
        }
        return true;
      });
    
    return converted;
  }, [messages]);

  // Filter out system messages
  const filteredMessages = normalizedMessages.filter((msg) => msg.role !== "system");

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({
        title: "Copied!",
        description: "Prompt copied to clipboard",
      });
    } catch (err) {
      addToast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleMakePublic = async (messageId: string, isCurrentlyPublic: boolean) => {
    if (!onMakePublic || makingPublic.has(messageId)) return;
    
    setMakingPublic(prev => new Set(prev).add(messageId));
    try {
      await onMakePublic(messageId);
      addToast({
        title: "Success",
        description: isCurrentlyPublic
          ? "Prompt removed from community"
          : "Prompt shared to community",
      });
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to update prompt",
        variant: "destructive",
      });
    } finally {
      setMakingPublic(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <Conversation>
        <ConversationContent>
          <div className="w-full max-w-3xl mx-auto">
            {filteredMessages.length === 0 ? (
              <ConversationEmptyState
                title="Say it simply. Prompt it perfectly."
                description="Engineer ideas into optimized AI prompts—plus access to a shared library of prompts created by the AiM community."
              />
            ) : (
              filteredMessages.map((message, index) => {
              const textContent = message.content || "";
              
              // For user messages, don't render if content is invalid
              if (message.role === 'user' && (!textContent || textContent === 'undefined' || textContent === 'null' || textContent.trim() === '')) {
                return null;
              }

              // For assistant messages, check if it's streaming (last message and isLoading)
              const isLastMessage = index === filteredMessages.length - 1;
              const isStreaming = message.role === "assistant" && isLoading && isLastMessage;
              const hasContent = textContent && textContent !== 'undefined' && textContent !== 'null' && textContent.trim() !== '';
              const isEmpty = !textContent || textContent.trim() === '';

              // Check if next message is a different role to add extra spacing
              const nextMessage = filteredMessages[index + 1];
              const isRoleTransition = nextMessage && nextMessage.role !== message.role;

              return (
                <Message 
                  key={message.id || `msg-${message.role}-${index}`} 
                  from={message.role}
                  className={isRoleTransition ? "mb-12" : "mb-6"}
                >
                  <MessageContent>
                    {message.role === "assistant" ? (
                      // Always show content if available (useChat updates it incrementally during streaming)
                      // Only show typing indicator if completely empty and streaming
                      hasContent ? (
                        <MessageResponse>{textContent}</MessageResponse>
                      ) : isStreaming ? (
                        <div className="flex items-center gap-1 px-4 py-2">
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                        </div>
                      ) : null
                    ) : (
                      <div className="text-sm whitespace-pre-wrap">{textContent}</div>
                    )}
                  </MessageContent>
                  {message.role === "assistant" && message.id && hasContent && (
                    <MessageActions>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(textContent)}
                        className="h-auto px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-4 w-4 mr-2" strokeWidth={1.5} />
                        Copy
                      </Button>
                      {/* Only show "Share with Community" if the message contains an optimized prompt */}
                      {onMakePublic && message.id && hasOptimizedPrompt(textContent) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMakePublic(message.id!, message.is_public || false)}
                          disabled={makingPublic.has(message.id!)}
                          className="group h-auto px-3 py-1.5 text-sm bg-gradient-to-r from-[#1C4C8A] to-[#31DBA5] text-white shadow-md hover:shadow-lg hover:scale-105 hover:from-[#2a5aa3] hover:to-[#3ddbb8] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
                        >
                          <Sparkles className="h-4 w-4 mr-2 text-white group-hover:text-[#ffffff] group-hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.6)] transition-all duration-200" strokeWidth={1.5} />
                          {message.is_public ? "Remove from Community" : "Share with Community"}
                        </Button>
                      )}
                    </MessageActions>
                  )}
                </Message>
              );
            })
            )}
            {/* Show thinking indicator when streaming but no assistant message yet */}
            {isLoading && filteredMessages.length > 0 && filteredMessages[filteredMessages.length - 1]?.role !== 'assistant' && (
              <Message from="assistant" className="mb-6">
                <MessageContent>
                  <div className="flex items-center gap-1 px-4 py-2">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                  </div>
                </MessageContent>
              </Message>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      
      <div className="flex justify-center bg-background pt-4 pb-4">
        <div className="w-full max-w-3xl mx-auto px-4">
          {filteredMessages.length === 0 ? (
            <ChatInput
              onSend={(message, promptType) => {
                if (promptType) {
                  setSelectedPromptType(promptType);
                  onPromptTypeChange?.(promptType);
                }
                onSend(message, promptType);
              }}
              disabled={isLoading}
              promptType={selectedPromptType}
              onPromptTypeChange={(type) => {
                setSelectedPromptType(type);
                onPromptTypeChange?.(type);
              }}
              centered={true}
            />
          ) : (
            <PromptInputWithType
              value={inputValue}
              onChange={setInputValue}
              onSubmit={(message, promptType) => {
                // Use the promptType passed from component or fallback to selectedPromptType
                const typeToUse = promptType || selectedPromptType;
                onSend(message, typeToUse);
                setInputValue("");
              }}
              promptType={selectedPromptType}
              disabled={isLoading}
              placeholder="Message..."
              centered={false}
              showPromptTypeSelector={false}
            />
          )}
          {/* Disclaimer text below input */}
          <p className="text-xs text-muted-foreground text-center mt-2">
            AiM Prompt Studio can make mistakes.
          </p>
        </div>
      </div>
    </div>
  );
}
