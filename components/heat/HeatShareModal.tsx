"use client";

import { useEffect, useState } from "react";
import { Copy, Mail, MessageSquare, Search, Sparkles } from "lucide-react";

import type { HeatResult } from "@/components/heat/HeatCard";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TEMPERATURE_META, type Temperature } from "@/lib/heat/types";
import { cn } from "@/lib/utils";

type Channel = "email" | "text";
type Audience = "buyer" | "listing";
interface Contact {
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
}

const CRM_LABELS: Record<string, string> = {
  followupboss: "Follow Up Boss",
  lofty: "Lofty",
  sierra: "Sierra Interactive",
  boldtrail: "BoldTrail",
  cinc: "CINC",
  cloze: "Cloze",
  gohighlevel: "GoHighLevel",
  csv: "CSV import",
};

function money(n: number | null): string {
  if (!n) return "—";
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

export function HeatShareModal({
  result,
  audience,
  onClose,
}: {
  result: HeatResult;
  audience: Audience;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [connected, setConnected] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Contact | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [subject, setSubject] = useState("A listing I thought of you for");
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const tempLabel = result.temperature
    ? TEMPERATURE_META[result.temperature as Temperature]?.label
    : `${result.heatScore}°`;
  const listingLine = `${result.address ?? "this listing"} — ${money(result.price)} · ${tempLabel} · ${result.views ?? 0} views / ${result.saves ?? 0} saves`;

  // Debounced server-side CRM search (empty query → recent contacts).
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/apps/heat/contacts?q=${encodeURIComponent(query.trim())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setConnected(Boolean(d.connected));
          if (d.platform) setPlatform(d.platform);
          setContacts(d.contacts ?? []);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const matches = query.trim().length > 0 ? contacts.slice(0, 8) : [];

  const recipient = picked
    ? picked
    : { name: manualName, email: manualEmail || null, phone: manualPhone || null };

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/apps/heat/share/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingLine, audience, channel, contactName: recipient.name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Couldn't draft.");
      if (channel === "email") {
        setSubject(d.subject ?? subject);
        setMessage(d.body ?? "");
      } else {
        setMessage(d.text ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't draft the message.");
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!message.trim()) return setError("Write a message first (or use ✨ Draft).");
    if (channel === "text" && !recipient.phone) return setError("Add a phone number to text.");
    if (channel === "email" && !recipient.email) return setError("Add an email address.");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/apps/heat/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zpid: result.zpid,
          listing: {
            address: result.address,
            price: result.price,
            imgSrc: result.imgSrc,
            beds: result.beds,
            baths: result.baths,
            livingArea: result.livingArea,
            temperature: result.temperature,
            heatScore: result.heatScore,
            views: result.views,
            saves: result.saves,
            detailUrl: result.detailUrl,
          },
          contact: recipient,
          channel,
          audience,
          message,
          subject,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Couldn't create the share.");
      setShareUrl(d.shareUrl);
      // Open the agent's own Messages / mail client, prefilled.
      const link = channel === "text" ? d.sms : d.mailto;
      if (link) window.location.href = link;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#FF3B30]/50";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share with a client</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <DialogBody className="max-h-[75vh] overflow-y-auto">
          <p className="text-sm text-muted-foreground">{listingLine}</p>

          {/* Channel */}
          <div className="mt-4 inline-flex rounded-lg border border-white/15 bg-black/20 p-0.5">
            {(["email", "text"] as Channel[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  channel === c
                    ? "bg-gradient-to-br from-[#FF3B30] to-[#C2410C] text-white"
                    : "text-white/70 hover:text-white",
                )}
              >
                {c === "email" ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                {c === "email" ? "Email" : "Text"}
              </button>
            ))}
          </div>

          {/* Recipient */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-white/70">Send to</label>
            {picked ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm">
                <span className="text-white">
                  {picked.name}{" "}
                  <span className="text-white/50">· {channel === "text" ? picked.phone : picked.email}</span>
                </span>
                <button type="button" onClick={() => setPicked(null)} className="text-xs text-white/50 hover:text-white">
                  change
                </button>
              </div>
            ) : (
              <>
                {connected && (
                  <div className="relative mt-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/40" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search your ${platform ? CRM_LABELS[platform] ?? "CRM" : "CRM"} by name…`}
                      className={cn(inputCls, "pl-8")}
                    />
                    {matches.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-white/15 bg-neutral-900 shadow-xl">
                        {matches.map((c, i) => (
                          <button
                            key={`${c.email ?? c.phone ?? i}`}
                            type="button"
                            onClick={() => {
                              setPicked(c);
                              setQuery("");
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5"
                          >
                            <span className="text-white">{c.name}</span>
                            <span className="text-xs text-white/50">{channel === "text" ? c.phone : c.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Client name" className={inputCls} />
                  {channel === "email" ? (
                    <input value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="client@email.com" className={inputCls} />
                  ) : (
                    <input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="(615) 555-0123" className={inputCls} />
                  )}
                </div>
                {!connected && (
                  <p className="mt-1 text-[11px] text-white/40">Connect a CRM to search contacts, or enter one manually.</p>
                )}
              </>
            )}
          </div>

          {/* Message */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-white/70">Message</label>
              <button
                type="button"
                onClick={draft}
                disabled={drafting}
                className="inline-flex items-center gap-1 text-xs text-[#FF6A3D] hover:underline disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" /> {drafting ? "Drafting…" : "Draft with AI"}
              </button>
            </div>
            {channel === "email" && (
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={cn(inputCls, "mt-1")} placeholder="Subject" />
            )}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className={cn(inputCls, "mt-2")}
              placeholder={`Write a note, or tap "Draft with AI". A "Request a showing" link is added automatically.`}
            />
          </div>

          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

          {shareUrl ? (
            <div className="mt-4 rounded-lg border border-[#FF3B30]/30 bg-[#FF3B30]/5 p-3 text-sm">
              <p className="text-white">Opening your {channel === "text" ? "Messages" : "email"}…</p>
              <p className="mt-1 text-xs text-white/60">If nothing opened, share this link:</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-black/30 px-2 py-1 text-xs text-white/80">{shareUrl}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(shareUrl)}
                  className="rounded p-1 text-white/60 hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#FF3B30] to-[#C2410C] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              {channel === "text" ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              {sending ? "Preparing…" : channel === "text" ? "Open Messages to send" : "Open email to send"}
            </button>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
