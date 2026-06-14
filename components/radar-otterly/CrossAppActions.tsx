"use client";

import { PenSquare } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
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
