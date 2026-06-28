import { useEffect, useRef, useState } from "react";

// Client-side helpers for the new-profile onboarding draft (save / resume).

export type OnboardingMode = "magic" | "control";

export interface OnboardingDraftRow {
  mode: OnboardingMode;
  data: unknown;
  updated_at: string;
}

export async function fetchDraft(): Promise<OnboardingDraftRow | null> {
  try {
    const res = await fetch("/api/profiles/onboarding/draft");
    if (!res.ok) return null;
    const json = await res.json();
    return (json.draft as OnboardingDraftRow | null) ?? null;
  } catch {
    return null;
  }
}

export async function saveDraft(mode: OnboardingMode, data: unknown): Promise<void> {
  try {
    await fetch("/api/profiles/onboarding/draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, data }),
    });
  } catch {
    /* best effort — losing a debounced autosave is non-fatal */
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await fetch("/api/profiles/onboarding/draft", { method: "DELETE" });
  } catch {
    /* best effort */
  }
}

export type AutosaveStatus = "idle" | "saving" | "saved";

/**
 * Debounced autosave. Persists `data` ~800ms after it actually CHANGES (we
 * compare the serialized payload so a re-render alone doesn't trigger a save —
 * which would otherwise loop). Only runs while `enabled`. Returns a status so
 * the UI can show a live "Saving… / Auto-saved" badge.
 */
export function useDraftAutosave(
  mode: OnboardingMode,
  data: unknown,
  enabled: boolean,
): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>("");
  const serialized = JSON.stringify(data);

  useEffect(() => {
    if (!enabled) return;
    if (serialized === lastSaved.current) return; // nothing actually changed
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      await saveDraft(mode, data);
      lastSaved.current = serialized;
      setStatus("saved");
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, enabled, mode]);

  return status;
}

/** Friendly "saved 3 min ago" style relative time. */
export function savedAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
