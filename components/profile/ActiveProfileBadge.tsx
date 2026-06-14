"use client";

import Link from "next/link";

import { useProfile } from "@/components/profile/ProfileProvider";

/**
 * Passive "Operating as ___" indicator shown in every app's ProductHeader.
 *
 * Reads from ProfileProvider — no fetches of its own. If the user has
 * no active profile (pre-backfill for legacy users), this returns null.
 */
export function ActiveProfileBadge() {
  const { activeProfile } = useProfile();

  if (!activeProfile) return null;

  return (
    <Link
      href="/apps/profile"
      className="hidden lg:inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-[hsl(var(--border))] text-xs font-medium hover:bg-[hsl(var(--accent))] transition-colors max-w-[220px]"
      title="Manage profiles"
    >
      <span className="text-[hsl(var(--muted-foreground))]">as</span>
      <span className="truncate">{activeProfile.display_name}</span>
    </Link>
  );
}
