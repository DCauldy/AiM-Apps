"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  Mail,
  Database,
  ArrowRight,
} from "lucide-react";
import {
  ChatBubble,
  ChatComposer,
  ChatMessageList,
  OnboardingChatFrame,
  OnboardingChatHeader,
  TypingIndicator,
} from "@/components/app-shell/OnboardingChatPrimitives";
import { Button } from "@/components/ui/button";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Draft {
  full_name: string | null;
  title: string | null;
  brokerage: string | null;
  phone: string | null;
  reply_to_email: string | null;
  license_number: string | null;
  physical_address: string | null;
  sign_off: string | null;
  brand_name: string | null;
  primary_color: string | null;
}

const EMPTY_DRAFT: Draft = {
  full_name: null,
  title: null,
  brokerage: null,
  phone: null,
  reply_to_email: null,
  license_number: null,
  physical_address: null,
  sign_off: null,
  brand_name: null,
  primary_color: null,
};

const INITIAL_GREETING =
  "Hey — quick setup. I just need a few things to build your sender identity (CAN-SPAM requires a real name + mailing address on every email). What's your full name, and what brokerage are you with?";

export function OnboardingChat({
  hasSender,
  hasEmail,
}: {
  hasSender: boolean;
  hasEmail: boolean;
}) {
  const toast = useHlToast();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: INITIAL_GREETING },
  ]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"chat" | "connect">(
    hasSender ? "connect" : "chat"
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/apps/hyperlocal/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Chat failed");
      setDraft(json.draft);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.assistant_message },
      ]);
      setReady(json.ready_to_save);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        "/api/apps/hyperlocal/onboarding/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success("Sender profile saved");
      setStep("connect");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // === Step 2: Connect screen ===
  if (step === "connect") {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-lg border border-border bg-card p-8 space-y-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <h1 className="text-xl font-semibold">Sender ready</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Two more things and you're ready to run a campaign.
          </p>

          <div className="space-y-3">
            <ConnectTile
              icon={<Database className="h-5 w-5" />}
              title="Connect a CRM"
              description="Follow Up Boss, Lofty, Sierra, BoldTrail, CINC, Cloze, GoHighLevel, or CSV."
              cta="Go to CRM settings"
              href="/apps/hyperlocal/settings?tab=crm"
            />
            <ConnectTile
              icon={<Mail className="h-5 w-5" />}
              title={hasEmail ? "Email connected" : "Connect a sending account"}
              description="Gmail, Outlook, or Resend (BYO key). Emails send from your own identity."
              cta={hasEmail ? "Manage email" : "Go to email settings"}
              href="/apps/hyperlocal/settings?tab=email"
              done={hasEmail}
            />
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-border">
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:no-underline"
              onClick={() => setStep("chat")}
            >
              ← Back to sender chat
            </button>
            <Button
              onClick={() => router.push("/apps/hyperlocal/dashboard")}
              className="bg-[#E11D48] hover:bg-[#BE123C]"
            >
              Skip for now <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // === Step 1: Chat ===
  return (
    <OnboardingChatFrame>
      <OnboardingChatHeader
        icon={<Sparkles className="h-4 w-4 text-[#F43F5E]" />}
        title="Hyperlocal setup"
        description="Step 1 of 2 · Build your sender identity"
      />

      {/* Messages */}
      <ChatMessageList scrollRef={scrollRef}>
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {busy && <TypingIndicator variant="spinner" />}
      </ChatMessageList>

        {/* Draft summary card (only shows once we have something) */}
        {(draft.full_name || draft.physical_address) && (
          <div className="border-t border-border px-4 py-2.5 bg-muted/30 text-xs">
            <p className="font-medium text-muted-foreground mb-1.5">
              What I have so far
            </p>
            <DraftRow label="Name" value={draft.full_name} />
            <DraftRow label="Title" value={draft.title} />
            <DraftRow label="Brokerage" value={draft.brokerage} />
            <DraftRow label="Phone" value={draft.phone} />
            <DraftRow label="Reply-to" value={draft.reply_to_email} />
            <DraftRow label="Address" value={draft.physical_address} />
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-3 space-y-2">
          {ready ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Looks complete. Save and continue?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReady(false)}
                >
                  Keep editing
                </Button>
                <Button
                  size="sm"
                  onClick={() => void finalize()}
                  disabled={saving}
                  className="bg-[#E11D48] hover:bg-[#BE123C]"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save & continue"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <ChatComposer
                value={input}
                onChange={setInput}
                onSend={() => void send()}
                disabled={busy}
                buttonClassName="bg-[#E11D48] hover:bg-[#BE123C]"
              />
            </>
          )}
        </div>
    </OnboardingChatFrame>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  return (
    <ChatBubble
      role={message.role}
      userClassName="bg-[#E11D48] text-white"
    >
      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
    </ChatBubble>
  );
}

function DraftRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2 items-baseline">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="font-medium text-foreground truncate">{value}</span>
    </div>
  );
}

function ConnectTile({
  icon,
  title,
  description,
  cta,
  href,
  done,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  href: string;
  done?: boolean;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-lg border border-border bg-background p-4 hover:bg-muted/40 transition-colors"
    >
      <span
        className={`flex items-center justify-center w-9 h-9 rounded-md ${
          done
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-[#F43F5E]/10 text-[#F43F5E]"
        } shrink-0`}
      >
        {done ? <CheckCircle2 className="h-5 w-5" /> : icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <span className="text-xs text-muted-foreground self-center shrink-0">
        {cta} →
      </span>
    </a>
  );
}
