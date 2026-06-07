"use client";

import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";

interface ProfileFieldsBannerProps {
  /** Human-readable list of fields owned by Profile, e.g. "Sender identity and brand visuals". */
  what: string;
}

/**
 * Banner used wherever an app page references fields that the unified
 * Profile owns. It is a permanent navigation cue, not a migration
 * notice — every AiM Automations app reads identity from the active
 * profile, and this banner is how the user gets to /apps/profile to
 * edit those fields.
 */
export function ProfileFieldsBanner({ what }: ProfileFieldsBannerProps) {
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
          {what} live on your Profile
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
