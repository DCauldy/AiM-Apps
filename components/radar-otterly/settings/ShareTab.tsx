"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

// Customer-managed public share links for the Radar dashboard.
// Each link is a random opaque token → sanitized read-only report
// at /r/[token]. Owner can revoke (soft-disable) or delete.

interface ShareLink {
  id: string;
  token: string;
  label: string | null;
  is_active: boolean;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
  expires_at: string | null;
}

export function ShareTab() {
  const { addToast } = useToast();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newExpires, setNewExpires] = useState<"never" | "30" | "90">("never");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/apps/radar/share", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLinks(data.links ?? []);
    } catch (e) {
      addToast({
        title: "Couldn't load share links",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/apps/radar/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim() || undefined,
          expires_in_days:
            newExpires === "never" ? null : parseInt(newExpires, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "created") {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setNewLabel("");
      setNewExpires("never");
      addToast({ title: "Share link created" });
      load();
    } catch (e) {
      addToast({
        title: "Couldn't create link",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, currentlyActive: boolean) => {
    try {
      const res = await fetch(`/api/apps/radar/share/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentlyActive }),
      });
      if (!res.ok) throw new Error("update failed");
      addToast({
        title: currentlyActive ? "Link revoked" : "Link re-activated",
      });
      load();
    } catch (e) {
      addToast({
        title: "Couldn't update",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this share link permanently?")) return;
    try {
      const res = await fetch(`/api/apps/radar/share/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      addToast({ title: "Link deleted" });
      load();
    } catch (e) {
      addToast({
        title: "Couldn't delete",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const copyLink = async (token: string, id: string) => {
    const url = `${window.location.origin}/r/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
      addToast({ title: "Copied to clipboard" });
    } catch {
      addToast({
        title: "Copy failed",
        description: "Browser blocked clipboard access.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Share2 className="h-4 w-4 text-sky-400" />
            Share your Radar report
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Create a public read-only link to share your AI visibility report
            with your broker, team, lender, or anyone else. Sanitized — no
            account or quota details leak. Revoke or delete anytime.
          </p>
        </header>
        <div className="p-5 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Label (optional)
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. For my broker"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Expires
            </label>
            <select
              value={newExpires}
              onChange={(e) =>
                setNewExpires(e.target.value as "never" | "30" | "90")
              }
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="never">Never</option>
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary-foreground bg-primary px-4 py-2 hover:opacity-90 disabled:opacity-50 h-[38px]"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create link
              </>
            )}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">
            Your share links{" "}
            {links && (
              <span className="text-muted-foreground font-normal">
                ({links.length})
              </span>
            )}
          </h2>
        </header>
        {links == null ? (
          <div className="px-5 py-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : links.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No share links yet. Create one above to start sharing.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                onCopy={() => copyLink(link.token, link.id)}
                onRevoke={() => handleRevoke(link.id, link.is_active)}
                onDelete={() => handleDelete(link.id)}
                copied={copiedId === link.id}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LinkRow({
  link,
  onCopy,
  onRevoke,
  onDelete,
  copied,
}: {
  link: ShareLink;
  onCopy: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  copied: boolean;
}) {
  const expired =
    link.expires_at != null &&
    new Date(link.expires_at).getTime() < Date.now();
  const usable = link.is_active && !expired;
  return (
    <li className="px-5 py-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {link.label && (
            <div className="text-sm font-medium truncate">{link.label}</div>
          )}
          <code className="text-[11px] text-muted-foreground font-mono break-all">
            /r/{link.token}
          </code>
          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {link.view_count} view{link.view_count === 1 ? "" : "s"}
            </span>
            <span>
              Created{" "}
              {new Date(link.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
            {link.expires_at && (
              <span
                className={cn(expired ? "text-rose-500" : "text-muted-foreground")}
              >
                {expired ? "Expired " : "Expires "}
                {new Date(link.expires_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            {!link.is_active && (
              <span className="text-rose-500">Revoked</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {usable && (
            <>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border bg-background hover:bg-muted transition-colors"
                title="Copy link"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
              <a
                href={`/r/${link.token}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border bg-background hover:bg-muted transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </a>
            </>
          )}
          <button
            type="button"
            onClick={onRevoke}
            className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={link.is_active ? "Revoke (keep history)" : "Re-activate"}
          >
            {link.is_active ? "Revoke" : "Re-activate"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-rose-500 transition-colors"
            title="Delete permanently"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </li>
  );
}
