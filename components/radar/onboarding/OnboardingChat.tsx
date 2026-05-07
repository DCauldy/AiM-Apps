"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Check, Pencil, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  extracted_data?: Record<string, unknown>;
  section?: string;
}

export function OnboardingChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSection, setCurrentSection] = useState<string>("professional_type");
  const [confirmedSections, setConfirmedSections] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Kick off initial AI greeting
  useEffect(() => {
    const greet = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/apps/radar/onboarding/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [], section: "professional_type" }),
        });
        if (res.ok) {
          const data = await res.json();
          setMessages([
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: data.content || "Welcome! Let's set up your profile. What type of real estate professional are you?",
              section: "professional_type",
            },
          ]);
        }
      } catch {
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Welcome! Let's set up your professional profile for Radar. What type of real estate professional are you? (e.g., Solo Agent, Team Leader, Broker/Owner, Loan Officer)",
            section: "professional_type",
          },
        ]);
      } finally {
        setLoading(false);
      }
    };
    greet();
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/apps/radar/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          section: currentSection,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content,
        extracted_data: data.extracted_data,
        section: data.section || currentSection,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (data.section) {
        setCurrentSection(data.section);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleConfirm = async (message: ChatMessage) => {
    if (!message.extracted_data || !message.section) return;

    setLoading(true);
    try {
      await fetch("/api/apps/blog-engine/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: message.section,
          data: message.extracted_data,
        }),
      });

      setConfirmedSections((prev) => new Set([...prev, message.section!]));

      // Check if all sections are done
      const allSections = ["professional_type", "market", "business_focus", "website", "identity"];
      const newConfirmed = new Set([...confirmedSections, message.section]);
      if (allSections.every((s) => newConfirmed.has(s))) {
        router.push("/apps/radar/onboarding?step=setup");
        return;
      }

      // Trigger next section
      const res = await fetch("/api/apps/radar/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          section: "next",
          confirmed_section: message.section,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.content,
            section: data.section,
          },
        ]);
        if (data.section) setCurrentSection(data.section);
      }
    } catch {
      // Proceed anyway
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (message: ChatMessage) => {
    if (!message.section) return;
    setCurrentSection(message.section);
    setInput(`Let me update my ${message.section.replace(/_/g, " ")} information: `);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-lg font-bold text-foreground">Profile Setup</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Tell us about your business so Radar can find the right queries for you.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            <div
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 w-7 h-7 rounded-full bg-[#e0a458]/10 flex items-center justify-center mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-[#e0a458]" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-[#1c4c8a] text-white"
                    : "text-foreground"
                )}
              >
                {msg.content}
              </div>
              {msg.role === "user" && (
                <div className="shrink-0 w-7 h-7 rounded-full bg-[#1c4c8a]/20 flex items-center justify-center mt-0.5">
                  <User className="h-3.5 w-3.5 text-[#1c4c8a]" />
                </div>
              )}
            </div>

            {/* Confirmation card for extracted data */}
            {msg.extracted_data && msg.section && !confirmedSections.has(msg.section) && (
              <div className="ml-10 max-w-[80%] rounded-lg border border-[#e0a458]/30 bg-[#e0a458]/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#e0a458] mb-2">
                  Confirm {msg.section.replace(/_/g, " ")}
                </p>
                <div className="space-y-1 mb-3">
                  {Object.entries(msg.extracted_data).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground capitalize min-w-[100px]">
                        {key.replace(/_/g, " ")}:
                      </span>
                      <span className="text-foreground">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleConfirm(msg)}
                    className="bg-[#e0a458] hover:bg-[#c88d3e] text-white"
                    disabled={loading}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(msg)}
                    disabled={loading}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                </div>
              </div>
            )}

            {msg.section && confirmedSections.has(msg.section) && msg.extracted_data && (
              <div className="ml-10 flex items-center gap-2 text-xs text-green-400">
                <Check className="h-3.5 w-3.5" />
                <span>Confirmed</span>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-[#e0a458]/10 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-[#e0a458]" />
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-border">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your response..."
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#e0a458]/50 focus:border-[#e0a458] disabled:opacity-50"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="bg-[#e0a458] hover:bg-[#c88d3e] text-white shrink-0"
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
