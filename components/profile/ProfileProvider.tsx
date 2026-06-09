"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import type { PlatformProfile } from "@/types/platform-profile";

// Shared shape used by every header/badge/chip consumer. The /api/profiles
// response carries more — we only project the fields anyone actually renders.
export interface ProfileSummary {
  id: string;
  display_name: string;
  brokerage: string | null;
  primary_color: string;
  accent_color: string;
}

interface ProfileContextValue {
  loaded: boolean;
  /** Active (non-archived) profiles owned by the current user. */
  profiles: ProfileSummary[];
  activeProfileId: string | null;
  /** Derived helper — the active profile, or null if none / not yet loaded. */
  activeProfile: ProfileSummary | null;
  /** POSTs activate then optimistically updates local state. Returns success. */
  switchProfile: (id: string) => Promise<boolean>;
  /** Re-fetches both endpoints. Call after a profile is created/archived. */
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

// Single shared provider for every consumer that previously fetched
// /api/profile or /api/profiles on its own mount (AppSwitcher,
// ActiveProfileBadge, ActiveProfileChip). Mounted once in /apps/layout.tsx
// so the cost is paid one time per session, not once per component.
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchAll = useCallback(async () => {
    const [meRes, profilesRes] = await Promise.all([
      fetch("/api/profile").catch(() => null),
      fetch("/api/profiles").catch(() => null),
    ]);

    if (meRes?.ok) {
      const me = await meRes.json().catch(() => null);
      setActiveProfileId(me?.active_profile_id ?? null);
    }

    if (profilesRes?.ok) {
      const payload = await profilesRes.json().catch(() => null);
      const rows: PlatformProfile[] = payload?.profiles ?? [];
      setProfiles(rows.filter((p) => !p.archived_at).map(toSummary));
    }

    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!userId) {
      // Logged out — keep loaded=false so the chip shows its loading state
      // until the parent layout redirects to /login.
      setProfiles([]);
      setActiveProfileId(null);
      return;
    }
    void fetchAll();
  }, [userId, fetchAll]);

  const switchProfile = useCallback(
    async (id: string) => {
      if (id === activeProfileId) return true;
      try {
        const res = await fetch(`/api/profiles/${id}/activate`, {
          method: "POST",
        });
        if (!res.ok) return false;
        // Optimistic — server-side state has flipped; reflect locally too,
        // then refresh server data (RSC tree may key off active profile).
        setActiveProfileId(id);
        router.refresh();
        return true;
      } catch {
        return false;
      }
    },
    [activeProfileId, router],
  );

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      loaded,
      profiles,
      activeProfileId,
      activeProfile,
      switchProfile,
      refresh: fetchAll,
    }),
    [loaded, profiles, activeProfileId, activeProfile, switchProfile, fetchAll],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used inside <ProfileProvider>");
  }
  return ctx;
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
