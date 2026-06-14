"use client";

import { useState } from "react";
import { FileSearch, Loader2, Play } from "lucide-react";

import { useToast } from "@/components/ui/toast";

// Slim "audit any URL" form. Secondary to Site Health (which targets
// the homepage); this lets the customer check blog posts, listing
// pages, team page, etc.

const CRAWLER_OPTIONS = [
  "ChatGPT-User",
  "OAI-SearchBot",
  "PerplexityCrawler",
  "GoogleBot",
] as const;

export function RunAuditSection({
  workspaceId,
  defaultUrl,
  onComplete,
}: {
  workspaceId: string;
  defaultUrl: string;
  onComplete: () => void;
}) {
  const { addToast } = useToast();
  const [type, setType] = useState<"content" | "crawlability">("content");
  const [url, setUrl] = useState(defaultUrl);
  const [crawler, setCrawler] = useState<(typeof CRAWLER_OPTIONS)[number]>(
    "ChatGPT-User",
  );
  const [submitting, setSubmitting] = useState(false);

  const handleRun = async () => {
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/apps/radar/optimize/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          workspaceId,
          url: url.trim(),
          crawlerIdentity: type === "content" ? crawler : undefined,
        }),
      });
      const payload = await res.json();
      if (payload.status === "created") {
        addToast({
          title: "Audit started",
          description: `${type === "content" ? "Content check" : "Crawlability check"} running — results in 30-90s.`,
        });
        onComplete();
      } else {
        throw new Error(payload.error?.message ?? "Audit dispatch failed");
      }
    } catch (e) {
      addToast({
        title: "Couldn't start audit",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          Check another page
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Audit any URL — your blog posts, listing pages, team page, etc.
        </p>
      </header>
      <div className="p-5 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">
            URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/page"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="content">Content check</option>
            <option value="crawlability">Crawlability check</option>
          </select>
        </div>
        {type === "content" && (
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">
              Crawler
            </label>
            <select
              value={crawler}
              onChange={(e) =>
                setCrawler(e.target.value as (typeof CRAWLER_OPTIONS)[number])
              }
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CRAWLER_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={handleRun}
          disabled={submitting || !url.trim() || !workspaceId}
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary-foreground bg-primary px-4 py-2 hover:opacity-90 disabled:opacity-50 h-[38px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run audit
            </>
          )}
        </button>
      </div>
    </section>
  );
}
