"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Mail,
  CheckCircle2,
  Send,
  Loader2,
  AlertTriangle,
  Undo2,
  Sparkles,
  Eye,
  Wrench,
  Beaker,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import {
  ComplianceFixItBanner,
  type ComplianceIssue,
} from "@/components/hyperlocal/runs/ComplianceFixItBanner";
import { cn } from "@/lib/utils";
import type { HlEmail } from "@/types/hyperlocal";

interface SegmentLite {
  geo_key: string;
  geo_label: string;
  contact_count: number;
  below_min_size: boolean;
}

interface EmailWithMeta extends HlEmail {
  recipient_count: number;
  segment?: SegmentLite | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  applied_changes?: { changed?: string[] } | null;
  created_at: string;
}

type Mode = "preview" | "blocks";

export function EmailDraftReview({
  runId,
  onApproved,
}: {
  runId: string;
  onApproved: () => void;
}) {
  const toast = useHlToast();
  const { confirm, promptInput, dialog } = useHlDialog();
  const [emails, setEmails] = useState<EmailWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("preview");
  const [approving, setApproving] = useState(false);
  const [complianceIssues, setComplianceIssues] = useState<
    ComplianceIssue[] | null
  >(null);
  const [testSending, setTestSending] = useState(false);

  // Block-editor local state (mirrors selected draft)
  const [editSubject, setEditSubject] = useState("");
  const [editPreheader, setEditPreheader] = useState("");
  const [editSellerHtml, setEditSellerHtml] = useState("");
  const [editBuyerHtml, setEditBuyerHtml] = useState("");
  const [savingBlocks, setSavingBlocks] = useState(false);

  // AI chat state
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const selected = emails.find((e) => e.id === selectedId);

  const loadEmails = useCallback(async () => {
    const res = await fetch(`/api/apps/hyperlocal/runs/${runId}/emails`);
    const json = await res.json();
    const list = (json.emails ?? []) as EmailWithMeta[];
    setEmails(list);
    if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    setLoading(false);
  }, [runId, selectedId]);

  // Initial load
  useEffect(() => {
    void loadEmails();
  }, [loadEmails]);

  // When selection changes: refresh the single email + load its chat history
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      const [emailRes, chatRes] = await Promise.all([
        fetch(`/api/apps/hyperlocal/runs/${runId}/emails/${selectedId}`),
        fetch(`/api/apps/hyperlocal/runs/${runId}/emails/${selectedId}/chat`),
      ]);
      if (cancelled) return;
      const emailJson = await emailRes.json();
      const chatJson = await chatRes.json();
      if (emailJson.email) {
        setEmails((prev) =>
          prev.map((e) =>
            e.id === selectedId ? { ...e, ...emailJson.email } : e
          )
        );
        setEditSubject(emailJson.email.subject ?? "");
        setEditPreheader(emailJson.email.preheader ?? "");
        setEditSellerHtml(emailJson.email.seller_perspective_html ?? "");
        setEditBuyerHtml(emailJson.email.buyer_perspective_html ?? "");
      }
      setChat(chatJson.messages ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, runId]);

  const saveBlocks = async () => {
    if (!selected) return;
    setSavingBlocks(true);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/emails/${selected.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: editSubject,
            preheader: editPreheader,
            seller_perspective_html: editSellerHtml || null,
            buyer_perspective_html: editBuyerHtml || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setEmails((prev) =>
        prev.map((e) => (e.id === selected.id ? { ...e, ...json.email } : e))
      );
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingBlocks(false);
    }
  };

  const sendChatMessage = async () => {
    if (!selected || !chatInput.trim()) return;
    const message = chatInput.trim();
    setChatInput("");
    setChatBusy(true);

    // Optimistic user turn
    setChat((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        role: "user",
        content: message,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/emails/${selected.id}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Chat failed");

      // Re-fetch the email so the preview + blocks reflect the new content
      const emailRes = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/emails/${selected.id}`
      );
      const emailJson = await emailRes.json();
      if (emailJson.email) {
        setEmails((prev) =>
          prev.map((e) =>
            e.id === selected.id ? { ...e, ...emailJson.email } : e
          )
        );
        setEditSubject(emailJson.email.subject ?? "");
        setEditPreheader(emailJson.email.preheader ?? "");
        setEditSellerHtml(emailJson.email.seller_perspective_html ?? "");
        setEditBuyerHtml(emailJson.email.buyer_perspective_html ?? "");
      }

      // Reload chat history (server already persisted both turns)
      const chatRes = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/emails/${selected.id}/chat`
      );
      const chatJson = await chatRes.json();
      setChat(chatJson.messages ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed");
      // Roll back the optimistic message
      setChat((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
    } finally {
      setChatBusy(false);
    }
  };

  const undoLast = async () => {
    if (!selected) return;
    setUndoing(true);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/emails/${selected.id}/undo`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Undo failed");

      const emailRes = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/emails/${selected.id}`
      );
      const emailJson = await emailRes.json();
      if (emailJson.email) {
        setEmails((prev) =>
          prev.map((e) =>
            e.id === selected.id ? { ...e, ...emailJson.email } : e
          )
        );
        setEditSubject(emailJson.email.subject ?? "");
        setEditPreheader(emailJson.email.preheader ?? "");
        setEditSellerHtml(emailJson.email.seller_perspective_html ?? "");
        setEditBuyerHtml(emailJson.email.buyer_perspective_html ?? "");
      }
      const chatRes = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/emails/${selected.id}/chat`
      );
      const chatJson = await chatRes.json();
      setChat(chatJson.messages ?? []);
      toast.success("Reverted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setUndoing(false);
    }
  };

  const toggleApprove = async (email: EmailWithMeta) => {
    const target = email.status === "approved" ? "draft" : "approved";
    const res = await fetch(
      `/api/apps/hyperlocal/runs/${runId}/emails/${email.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Update failed");
      return;
    }
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, ...json.email } : e))
    );
  };

  /**
   * Send a test copy of one specific draft (the currently-previewed one) to
   * the user's auth email or 1-3 custom addresses.
   */
  const sendTest = async (emailId: string) => {
    const input = await promptInput({
      title: "Send a test copy of this draft",
      message:
        "Comma-separated addresses, max 3. Leave blank to send to your own account email.",
      placeholder: "you@yourdomain.com",
      confirmLabel: "Send test",
    });
    if (input === null) return;       // user cancelled
    const test_emails = input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setTestSending(true);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/test-send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test_emails, email_id: emailId }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test send failed");
      if (json.failed > 0) {
        toast.error(
          `${json.sent} sent · ${json.failed} failed. Check the connected email account.`
        );
      } else {
        toast.success(
          `Test sent to ${json.test_emails.join(", ")}`
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTestSending(false);
    }
  };

  const approveAndSend = async (opts: { skipConfirm?: boolean } = {}) => {
    if (!opts.skipConfirm) {
      const ok = await confirm({
        title: "Approve all drafts and start sending?",
        message: `${totalRecipients.toLocaleString()} email${totalRecipients === 1 ? "" : "s"} will be queued for delivery. The send can't be paused mid-batch.`,
        confirmLabel: "Send now",
        destructive: true,
      });
      if (!ok) return;
    }
    setApproving(true);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approve_all: true }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        // Compliance gate refused the launch — surface the structured issue
        // list inline so the user knows exactly what to fix and where.
        if (Array.isArray(json.issues) && json.issues.length > 0) {
          setComplianceIssues(json.issues as ComplianceIssue[]);
          return;
        }
        throw new Error(json.error ?? "Approve failed");
      }
      setComplianceIssues(null);
      toast.success(`Sending ${json.approved_count} email(s)`);
      onApproved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <Loader2 className="h-6 w-6 mx-auto text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No drafts generated.</p>
      </div>
    );
  }

  const approvedCount = emails.filter((e) => e.status === "approved").length;
  const totalRecipients = emails.reduce(
    (sum, e) => (e.status === "approved" ? sum + e.recipient_count : sum),
    0
  );

  const canUndo = selected?.last_edit_snapshot != null;
  const refinementsLeft = selected
    ? selected.refinements_limit - selected.refinements_used
    : 0;

  return (
    <>
      {complianceIssues && (
        <ComplianceFixItBanner
          issues={complianceIssues}
          retrying={approving}
          onRetry={() => approveAndSend({ skipConfirm: true })}
          onDismiss={() => setComplianceIssues(null)}
        />
      )}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
      {dialog}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Drafts ready for review</p>
          <p className="text-xs text-muted-foreground">
            {approvedCount}/{emails.length} approved · {totalRecipients}{" "}
            recipients queued
          </p>
        </div>
        <Button
          onClick={() => approveAndSend()}
          disabled={approving || testSending}
          className="bg-[#E11D48] hover:bg-[#BE123C]"
        >
          {approving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" /> Approve all & send
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-12">
        {/* Sidebar — list of drafts */}
        <aside className="col-span-12 sm:col-span-3 border-r border-border max-h-[640px] overflow-y-auto">
          <ul>
            {emails.map((e) => {
              const segLabel = e.segment?.geo_label ?? "Segment";
              const lowConfidence = e.segment?.below_min_size === true;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-border hover:bg-muted/40",
                      selectedId === e.id && "bg-muted/60"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium truncate flex-1">
                        {segLabel}
                      </p>
                      {e.status === "approved" && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {e.subject || "(no subject)"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <p className="text-[10px] text-muted-foreground">
                        {e.recipient_count} recipient
                        {e.recipient_count === 1 ? "" : "s"}
                      </p>
                      {lowConfidence && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          <AlertTriangle className="h-2.5 w-2.5" /> Low
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Middle — preview / blocks editor */}
        <section className="col-span-12 sm:col-span-6 p-4 max-h-[640px] overflow-y-auto">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select an email.</p>
          ) : (
            <div className="space-y-3">
              {/* Header with badges + actions */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  {selected.segment?.below_min_size && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                      <AlertTriangle className="h-3 w-3" /> Low confidence —{" "}
                      {selected.recipient_count} recipient
                      {selected.recipient_count === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant={mode === "preview" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMode("preview")}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
                  </Button>
                  <Button
                    variant={mode === "blocks" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMode("blocks")}
                  >
                    <Wrench className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendTest(selected.id)}
                    disabled={testSending}
                    title="Send this one draft to a test address"
                  >
                    {testSending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Beaker className="h-3.5 w-3.5 mr-1.5" /> Test
                      </>
                    )}
                  </Button>
                  <Button
                    variant={
                      selected.status === "approved" ? "outline" : "default"
                    }
                    size="sm"
                    onClick={() => toggleApprove(selected)}
                  >
                    {selected.status === "approved" ? (
                      "Un-approve"
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {mode === "preview" ? (
                <iframe
                  title="Email preview"
                  srcDoc={selected.html ?? ""}
                  className="w-full h-[540px] border border-border rounded-md bg-white"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="space-y-3">
                  <Field label="Subject">
                    <Input
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      maxLength={120}
                    />
                  </Field>
                  <Field label="Preheader (Gmail preview snippet)">
                    <Input
                      value={editPreheader}
                      onChange={(e) => setEditPreheader(e.target.value)}
                      maxLength={150}
                    />
                  </Field>
                  <Field label="For Homeowners (HTML)">
                    <Textarea
                      value={editSellerHtml}
                      onChange={(e) => setEditSellerHtml(e.target.value)}
                      rows={6}
                      className="font-mono text-xs"
                    />
                  </Field>
                  <Field label="For Buyers (HTML)">
                    <Textarea
                      value={editBuyerHtml}
                      onChange={(e) => setEditBuyerHtml(e.target.value)}
                      rows={6}
                      className="font-mono text-xs"
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Signature and footer (your name, brokerage, address,
                    unsubscribe link) are rendered automatically from your
                    sender profile.
                  </p>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button onClick={saveBlocks} disabled={savingBlocks}>
                      {savingBlocks ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right — AI chat */}
        <aside className="col-span-12 sm:col-span-3 border-l border-border flex flex-col max-h-[640px]">
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#F43F5E]" />
              <p className="text-xs font-semibold">AI edits</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={undoLast}
              disabled={!canUndo || undoing}
              title={canUndo ? "Revert last edit" : "Nothing to undo"}
              className="h-7 px-2"
            >
              {undoing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Undo2 className="h-3 w-3 mr-1" /> Undo
                </>
              )}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {chat.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Ask Claude to tweak this draft.<br />
                <span className="text-[11px]">e.g. "make the homeowners section punchier" or "shorten the subject"</span>
              </p>
            ) : (
              chat.map((m) => (
                <ChatBubble key={m.id} message={m} />
              ))
            )}
            {chatBusy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Thinking…
              </div>
            )}
          </div>

          <div className="border-t border-border p-2.5 space-y-1.5">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void sendChatMessage();
                }
              }}
              placeholder="Make the buyer section shorter…"
              rows={2}
              disabled={chatBusy || refinementsLeft <= 0}
              className="text-xs resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {refinementsLeft} of {selected?.refinements_limit ?? 10} left
                {refinementsLeft <= 0 && " (use Edit mode)"}
              </span>
              <Button
                size="sm"
                onClick={() => void sendChatMessage()}
                disabled={
                  chatBusy || !chatInput.trim() || refinementsLeft <= 0
                }
                className="h-7"
              >
                Send
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
    </>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="rounded-md bg-muted/60 px-2.5 py-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
          You
        </p>
        <p className="text-xs leading-snug whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    );
  }
  if (message.role === "system") {
    return (
      <p className="text-[11px] italic text-muted-foreground px-2.5 py-1">
        {message.content}
      </p>
    );
  }
  // assistant
  const changed = message.applied_changes?.changed ?? [];
  return (
    <div className="rounded-md bg-[#F43F5E]/5 border border-[#F43F5E]/20 px-2.5 py-1.5">
      <p className="text-[11px] uppercase tracking-wide text-[#F43F5E] mb-0.5 flex items-center gap-1">
        <Sparkles className="h-2.5 w-2.5" /> AI
      </p>
      <p className="text-xs leading-snug whitespace-pre-wrap">
        {message.content}
      </p>
      {changed.length > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Changed:{" "}
          {changed
            .map((c) =>
              c === "seller_perspective_html"
                ? "Homeowners section"
                : c === "buyer_perspective_html"
                  ? "Buyers section"
                  : c
            )
            .join(", ")}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}
