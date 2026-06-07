"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ProfileSummary {
  id: string;
  display_name: string;
  primary_color: string;
  accent_color: string;
}

/**
 * Passive "Operating as ___" indicator shown in every app's ProductHeader.
 *
 * Fetches the user's active profile once on mount. Click → /apps/profile so
 * the user can switch or edit. If the user has no active profile (pre-backfill
 * for legacy users), this returns null.
 */
export function ActiveProfileBadge() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const meRes = await fetch("/api/profile").catch(() => null);
      if (!meRes?.ok) return;
      const me = await meRes.json();
      if (!me?.active_profile_id) return;

      const profRes = await fetch(`/api/profiles/${me.active_profile_id}`).catch(() => null);
      if (!profRes?.ok) return;
      const data = await profRes.json();
      if (!cancelled && data?.profile) {
        setProfile({
          id: data.profile.id,
          display_name: data.profile.display_name,
          primary_color: data.profile.primary_color,
          accent_color: data.profile.accent_color,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!profile) return null;

  return (
    <Link
      href="/apps/profile"
      className="hidden lg:inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-[hsl(var(--border))] text-xs font-medium hover:bg-[hsl(var(--accent))] transition-colors max-w-[220px]"
      title="Manage profiles"
    >
      <span
        className="w-3 h-3 rounded-sm shrink-0"
        style={{
          background: `linear-gradient(135deg, ${profile.primary_color}, ${profile.accent_color})`,
        }}
      />
      <span className="text-[hsl(var(--muted-foreground))]">as</span>
      <span className="truncate">{profile.display_name}</span>
    </Link>
  );
}
