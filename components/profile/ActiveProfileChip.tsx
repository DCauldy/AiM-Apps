"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";
import { useProfile } from "@/components/profile/ProfileProvider";

/**
 * Always-visible profile chip for the /apps landing page.
 *
 * Shows the user's active profile with an inline dropdown to quick-switch
 * to any other profile, see manage profiles, or create a new one when
 * the user has none yet.
 *
 * Reads from ProfileProvider — no fetches of its own.
 */
export function ActiveProfileChip() {
  const router = useRouter();
  const {
    loaded,
    profiles,
    activeProfile,
    activeProfileId,
    switchProfile,
  } = useProfile();
  const [busy, setBusy] = useState(false);

  const others = profiles.filter((p) => p.id !== activeProfileId);

  async function handleSwitch(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await switchProfile(id);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="glass-card inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm text-white/70">
        <span className="w-4 h-4 rounded-sm bg-white/20 animate-pulse" />
        <span>Loading profile…</span>
      </div>
    );
  }

  // No active profile yet (also no profiles) — push toward setup
  if (!activeProfile && others.length === 0) {
    return (
      <Link
        href="/apps/profile/new"
        className="glass-card inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white"
      >
        <Plus className="h-4 w-4" />
        Set up your first profile
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="glass-card inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="text-muted-foreground">Operating as</span>
        {activeProfile ? (
          <span className="font-semibold">{activeProfile.display_name}</span>
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
                onClick={() => handleSwitch(p.id)}
                className={cn(
                  "flex items-center gap-2.5 py-2 cursor-pointer",
                  busy && "opacity-50 pointer-events-none"
                )}
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
