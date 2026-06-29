"use client";

import { useState } from "react";
import { Loader2, PenSquare, Share2 } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { FEATURES } from "@/lib/feature-flags";

// Cross-app action helpers — shared by Optimize, Research, and the
// Recommended Actions panel. Each helper deep-links into a sibling
// AiM app with the Radar context already in the URL so the
// destination can surface a contextual banner ("Radar suggested X").
//
// All helpers respect feature flags — return null if the destination
// app isn't enabled for this deployment.

interface WriteAboutThisLinkProps {
  prompt: string;
  /** Visual variant. `icon` = bare pencil (used inline in tight
   *  table-like rows). `label` = pencil + "Write" text (used where
   *  there's room for a fuller CTA). */
  variant?: "icon" | "label";
  className?: string;
}

export function WriteAboutThisLink({
  prompt,
  variant = "icon",
  className,
}: WriteAboutThisLinkProps) {
  if (!FEATURES.BLOG_ENGINE) return null;
  const href = `/apps/blog-engine/topics?suggest=${encodeURIComponent(prompt)}`;

  if (variant === "label") {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border bg-background text-foreground hover:border-primary/50 hover:text-primary transition-colors",
          className,
        )}
        title="Write a blog post about this with Blog Engine"
      >
        <PenSquare className="h-3 w-3" />
        Write a blog
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 text-muted-foreground hover:text-primary transition-colors",
        className,
      )}
      title="Write a blog post about this with Blog Engine"
    >
      <PenSquare className="h-3.5 w-3.5" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// ShareWinButton — one-click create + copy a Radar share link with a
// pre-filled "Win: <prompt>" label. POSTs to /api/apps/radar/share,
// copies the returned /r/[token] URL to the clipboard, and toasts.
//
// Used by the Recommended Actions panel for Win-type rows. Saves
// the customer from the 4-step manual flow (open Settings → fill
// form → create → copy → send to broker).
//
// Falls back to redirecting to the Share tab if the create OR
// clipboard write fails — customer still gets there, just with one
// more click.
// ---------------------------------------------------------------------------

interface ShareWinButtonProps {
  /** The prompt text the customer is winning on. Becomes the link's
   *  label so future-them recognizes which win this represented when
   *  they audit their share links in Settings later. */
  prompt: string;
  className?: string;
}

export function ShareWinButton({ prompt, className }: ShareWinButtonProps) {
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    setSubmitting(true);
    try {
      const label = `Win: ${prompt}`.slice(0, 80);
      const res = await fetch("/api/apps/radar/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Default to never-expire so the broker can keep referencing it.
        // Customer can set an expiration in Settings if they want.
        body: JSON.stringify({ label, expires_in_days: null }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "created" || !data.link?.token) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const url = `${window.location.origin}/r/${data.link.token}`;
      try {
        await navigator.clipboard.writeText(url);
        addToast({
          title: "Share link copied",
          description: "Paste it into a message to your broker or team.",
        });
      } catch {
        // Clipboard blocked (insecure context, permission denied, etc.)
        // — still succeeded creating the link, just couldn't auto-copy.
        // Redirect to the Share tab so they can copy manually.
        addToast({
          title: "Share link created",
          description: "Copy it from Settings → Share.",
        });
        window.location.href = "/apps/radar/settings?tab=share";
      }
    } catch (e) {
      addToast({
        title: "Couldn't create share link",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border bg-background text-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      title="Create a public share link for this win and copy it to your clipboard"
    >
      {submitting ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Creating…
        </>
      ) : (
        <>
          <Share2 className="h-3 w-3" />
          Share Win
        </>
      )}
    </button>
  );
}
