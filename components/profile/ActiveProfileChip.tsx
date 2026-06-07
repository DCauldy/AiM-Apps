"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Plus, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PlatformProfile } from "@/types/platform-profile";

interface ProfileSummary {
  id: string;
  display_name: string;
  brokerage: string | null;
  primary_color: string;
  accent_color: string;
}

/**
 * Always-visible profile chip for the /apps landing page.
 *
 * Shows the user's active profile with an inline dropdown to quick-switch
 * to any other profile, see manage profiles, or create a new one when
 * the user has none yet.
 */
export function ActiveProfileChip() {
  const router = useRouter();
  const [active, setActive] = useState<ProfileSummary | null>(null);
  const [others, setOthers] = useState<ProfileSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const meRes = await fetch("/api/profile").catch(() => null);
      const profilesRes = await fetch("/api/profiles").catch(() => null);

      if (!meRes?.ok || !profilesRes?.ok) {
        if (!cancelled) setLoaded(true);
        return;
      }

      const me = await meRes.json();
      const profilesPayload = await profilesRes.json();
      const activeProfiles: PlatformProfile[] = (profilesPayload.profiles ?? []).filter(
        (p: PlatformProfile) => !p.archived_at
      );

      if (cancelled) return;
      const activeId = me?.active_profile_id ?? null;
      const summaries = activeProfiles.map(toSummary);
      setActive(summaries.find((p) => p.id === activeId) ?? null);
      setOthers(summaries.filter((p) => p.id !== activeId));
      setLoaded(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchProfile(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/profiles/${id}/activate`, { method: "POST" });
      if (res.ok) {
        // Reload to pick up the new active context
        router.refresh();
        // Optimistic local update so the chip changes immediately
        const next = others.find((p) => p.id === id);
        if (next && active) {
          setActive(next);
          setOthers([active, ...others.filter((p) => p.id !== id)]);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border bg-card/50 text-sm text-muted-foreground">
        <span className="w-4 h-4 rounded-sm bg-muted animate-pulse" />
        <span>Loading profile…</span>
      </div>
    );
  }

  // No active profile yet (also no profiles) — push toward setup
  if (!active && others.length === 0) {
    return (
      <Link
        href="/apps/profile/new"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-dashed border-foreground/30 hover:border-foreground/60 hover:bg-accent transition-colors text-sm font-medium"
      >
        <Plus className="h-4 w-4" />
        Set up your first profile
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-border bg-card hover:bg-accent transition-colors text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="text-muted-foreground">Operating as</span>
        {active ? (
          <>
            <span
              className="w-4 h-4 rounded-sm shrink-0"
              style={{ background: `linear-gradient(135deg, ${active.primary_color}, ${active.accent_color})` }}
            />
            <span className="font-semibold">{active.display_name}</span>
          </>
        ) : (
          <span className="font-semibold text-muted-foreground">No profile selected</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-72">
        {others.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Switch to
            </DropdownMenuLabel>
            {others.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => switchProfile(p.id)}
                disabled={busy}
                className="flex items-center gap-2.5 py-2 cursor-pointer"
              >
                <span
                  className="w-5 h-5 rounded shrink-0"
                  style={{ background: `linear-gradient(135deg, ${p.primary_color}, ${p.accent_color})` }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.display_name}</p>
                  {p.brokerage && (
                    <p className="text-[11px] text-muted-foreground truncate">{p.brokerage}</p>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => router.push("/apps/profile")}
          className="flex items-center gap-2.5 py-2 cursor-pointer"
        >
          <span className="flex items-center justify-center w-5 h-5 rounded bg-muted">
            <Settings2 className="h-3 w-3" />
          </span>
          <span className="text-sm">Manage profiles</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push("/apps/profile/new")}
          className="flex items-center gap-2.5 py-2 cursor-pointer"
        >
          <span className="flex items-center justify-center w-5 h-5 rounded bg-muted">
            <Plus className="h-3 w-3" />
          </span>
          <span className="text-sm">New profile</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function toSummary(p: PlatformProfile): ProfileSummary {
  return {
    id: p.id,
    display_name: p.display_name,
    brokerage: p.brokerage,
    primary_color: p.primary_color,
    accent_color: p.accent_color,
  };
}
