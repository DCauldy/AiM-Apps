"use client";

import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";

interface ProfileMigrationBannerProps {
  /** Human-readable list of what moved, e.g. "Sender identity and brand visuals". */
  what: string;
}

/**
 * Banner shown on per-app settings pages where some configuration
 * has moved to the unified Profile system. Used at the top of
 * Hyperlocal settings, Blog Engine settings, etc., to direct users
 * to /apps/profile for fields that previously lived in those pages.
 */
export function ProfileMigrationBanner({ what }: ProfileMigrationBannerProps) {
  return (
    <Link
      href="/apps/profile"
      className="group flex items-start gap-3 rounded-lg border border-border bg-card/60 hover:bg-card transition-colors p-4 mb-6"
    >
      <span className="flex items-center justify-center w-9 h-9 rounded-md bg-foreground/10 shrink-0">
        <Building2 className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          {what} now live on your Profile
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          One identity per company, shared across every AiM Automations app.
          Edit it once and the change applies everywhere.
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors shrink-0 pt-1.5">
        Open Profile
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
