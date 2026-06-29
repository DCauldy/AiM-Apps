"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HyperlocalMap, type MapSegment } from "@/components/hyperlocal/map/HyperlocalMap";
import {
  CampaignDialPanel,
  type DialValues,
  type DialLens,
  type PropertyType,
} from "@/components/hyperlocal/sphere/CampaignDialPanel";
import {
  suggestCampaign,
  type CampaignSuggestion,
} from "@/lib/hyperlocal/sphere-suggest";
import {
  SphereModeLauncher,
  type SphereMode,
} from "@/components/hyperlocal/sphere/SphereModeLauncher";
import type { SphereSnapshot, SphereZip } from "@/lib/hyperlocal/sphere";

interface SphereResponse {
  snapshot: SphereSnapshot | null;
  refreshing: boolean;
  connected: boolean;
  runId?: string;
}

function zipsToSegments(zips: SphereZip[]): MapSegment[] {
  return zips.map((z) => ({
    zip: z.zip,
    geo_label: z.zip,
    contact_count: z.contact_count,
  }));
}

export function SphereMapClient({
  editCampaignId = null,
}: {
  editCampaignId?: string | null;
}) {
  const router = useRouter();
  const editing = !!editCampaignId;
  const [zips, setZips] = useState<SphereZip[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chosen at the mode picker. Null = picker still showing. When editing a
  // saved campaign we skip the picker entirely (mode is irrelevant to a save).
  const [mode, setMode] = useState<SphereMode | null>(editing ? "magic" : null);
  // The campaign being edited (name + initial dial values).
  const [editCampaign, setEditCampaign] = useState<{
    name: string;
    lens: DialLens;
    propertyType: PropertyType;
    priceMin: number | null;
    priceMax: number | null;
  } | null>(null);
  // The pre-built campaign suggestion (the "we built this for you" magic).
  const [suggestion, setSuggestion] = useState<CampaignSuggestion | null>(null);
  // Remount key so the dial panel re-seeds from a fresh suggestion.
  const [panelKey, setPanelKey] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  // Once the user clicks the map themselves, we stop auto-building. When
  // editing, this starts true so the auto-suggest never overrides the saved
  // campaign's selection.
  const userTouched = useRef(editing);
  // Snapshot kept around so picking a mode after load can apply the suggestion.
  const snapshotRef = useRef<SphereSnapshot | null>(null);
  // Mirror of `mode` for stable reads inside the EventSource/fetch closures.
  const modeRef = useRef<SphereMode | null>(null);
  modeRef.current = mode;

  // Load the saved campaign when editing: pre-select its ZIPs + seed the dials.
  useEffect(() => {
    if (!editCampaignId) return;
    let cancelled = false;
    fetch(`/api/apps/hyperlocal/campaigns/${editCampaignId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(({ campaign: c }) => {
        if (cancelled || !c) return;
        const type = (c.property_type_filters?.[0] ?? "all") as PropertyType;
        setEditCampaign({
          name: c.name,
          lens: (c.lens ?? "balanced") as DialLens,
          propertyType: type,
          priceMin: c.price_range_low ?? null,
          priceMax: c.price_range_high ?? null,
        });
        setSelected(new Set<string>(c.service_area_zips ?? []));
        setPanelKey((k) => k + 1);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load that campaign.");
      });
    return () => {
      cancelled = true;
    };
  }, [editCampaignId]);

  // Pre-light the densest neighborhoods + pre-set the dials from the sphere.
  // Only Magic mode auto-builds; Control starts blank so the agent curates.
  const applySuggestion = useCallback((snapshot: SphereSnapshot) => {
    const sugg = suggestCampaign(snapshot);
    if (!sugg) return;
    setSuggestion(sugg);
    setSelected(new Set(sugg.zips));
    setPanelKey((k) => k + 1);
  }, []);

  // Mode chosen at the picker. Magic pre-builds from the cached snapshot.
  const pickMode = useCallback(
    (m: SphereMode) => {
      setMode(m);
      if (m === "magic" && !userTouched.current && snapshotRef.current) {
        applySuggestion(snapshotRef.current);
      }
    },
    [applySuggestion],
  );

  const toggleZip = useCallback((zip: string) => {
    userTouched.current = true;
    setSuggestion(null); // they're customizing now — drop the "we built this" hint
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(zip)) next.delete(zip);
      else next.add(zip);
      return next;
    });
  }, []);

  const streamRefresh = useCallback((runId: string) => {
    esRef.current?.close();
    const es = new EventSource(
      `/api/apps/hyperlocal/sphere/stream?runId=${encodeURIComponent(runId)}`,
    );
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          type: "progress" | "done" | "error";
          progress?: number;
          message?: string;
          snapshot?: SphereSnapshot | null;
          connected?: boolean;
        };
        if (data.type === "progress") {
          if (typeof data.progress === "number") setProgress(data.progress);
          if (data.message) setProgressMsg(data.message);
        } else if (data.type === "done") {
          if (data.snapshot) {
            setZips(data.snapshot.zips);
            setConnected(true);
            snapshotRef.current = data.snapshot;
            if (modeRef.current === "magic" && !userTouched.current)
              applySuggestion(data.snapshot);
          } else if (data.connected === false) {
            setConnected(false);
          }
          setRefreshing(false);
          setProgress(100);
          es.close();
        } else if (data.type === "error") {
          setError(data.message ?? "Refresh failed.");
          setRefreshing(false);
          es.close();
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      setRefreshing(false);
      es.close();
    };
  }, [applySuggestion]);

  // Load cached snapshot immediately; stream a refresh if stale.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/apps/hyperlocal/sphere")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: SphereResponse) => {
        if (cancelled) return;
        if (data.snapshot) {
          setZips(data.snapshot.zips);
          snapshotRef.current = data.snapshot;
          if (modeRef.current === "magic" && !userTouched.current)
            applySuggestion(data.snapshot);
        }
        setConnected(data.connected);
        setLoading(false);
        if (data.refreshing && data.runId) {
          setRefreshing(true);
          setProgress(8);
          setProgressMsg("Lighting up your sphere…");
          streamRefresh(data.runId);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load your sphere.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [streamRefresh, applySuggestion]);

  const handleLaunch = useCallback(
    async (values: DialValues, mode: "magic" | "control") => {
      setLaunching(true);
      setError(null);

      // Editing a saved campaign → PATCH its config, then back to the list.
      if (editCampaignId) {
        try {
          const res = await fetch(
            `/api/apps/hyperlocal/campaigns/${editCampaignId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                service_area_zips: Array.from(selected),
                lens: values.lens,
                property_type_filters:
                  values.propertyType === "all" ? [] : [values.propertyType],
                price_range_low: values.priceMin,
                price_range_high: values.priceMax,
              }),
            },
          );
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error ?? "Couldn't save changes.");
            setLaunching(false);
            return;
          }
          router.push("/apps/hyperlocal/campaigns");
        } catch {
          setError("Couldn't save changes.");
          setLaunching(false);
        }
        return;
      }

      try {
        const res = await fetch("/api/apps/hyperlocal/sphere/launch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zips: Array.from(selected),
            lens: values.lens,
            reach: values.reach,
            depth: values.depth,
            propertyType: values.propertyType,
            priceMin: values.priceMin,
            priceMax: values.priceMax,
            mode,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't start the campaign.");
          setLaunching(false);
          return;
        }
        window.dispatchEvent(new Event("hyperlocal-usage-updated"));
        // Magic → streamlined one-click experience; Control → classic editor.
        router.push(
          `/apps/hyperlocal/runs/${data.runId}${mode === "magic" ? "?magic=1" : ""}`,
        );
      } catch {
        setError("Couldn't start the campaign.");
        setLaunching(false);
      }
    },
    [selected, router, mode, editCampaignId],
  );

  // Include any selected ZIP that isn't in the current sphere snapshot (e.g. an
  // edited campaign's saved ZIP) so it still renders + can be toggled.
  const segments = (() => {
    const base = zipsToSegments(zips);
    const present = new Set(base.map((s) => s.zip));
    const extra: MapSegment[] = Array.from(selected)
      .filter((z) => !present.has(z))
      .map((z) => ({ zip: z, geo_label: z, contact_count: 0 }));
    return [...base, ...extra];
  })();
  const totalContacts = zips.reduce((s, z) => s + z.contact_count, 0);
  const hasSelection = selected.size > 0;

  // No CRM wired up yet — point them at the profile CRM tab.
  if (!loading && !connected && zips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-20 text-center">
        <p className="text-lg font-semibold">Connect your CRM to light up the map</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Hyperlocal paints your contacts onto a map of their neighborhoods.
          Connect a CRM in your profile and your sphere appears here.
        </p>
        <Link
          href="/apps/profile"
          className="mt-5 rounded-lg bg-[#F43F5E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e11d48]"
        >
          Connect a CRM
        </Link>
      </div>
    );
  }

  // Mode picker — the front door. Magic vs Control Freak, mirroring the
  // profile-onboarding choice. Shown until the agent picks how to build.
  if (mode === null) {
    return (
      <SphereModeLauncher
        onPick={pickMode}
        totalContacts={totalContacts}
        neighborhoodCount={zips.length}
      />
    );
  }

  return (
    <div className="relative">
      {/* Header line */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">
              {editing ? "Edit campaign" : "Your sphere"}
            </h1>
            <span className="rounded-full border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-2 py-0.5 text-[10px] font-medium text-[#F43F5E]">
              {editing
                ? editCampaign?.name ?? "Loading…"
                : mode === "magic"
                  ? "✨ AI Magic"
                  : "🤓 Control Freak"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {editing
              ? "Adjust the neighborhoods, angle, and data scope, then save."
              : loading
                ? "Loading your neighborhoods…"
                : `${zips.length} neighborhood${zips.length === 1 ? "" : "s"} · ${totalContacts.toLocaleString()} contacts`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasSelection && !editing && (
            <button
              type="button"
              onClick={() => {
                userTouched.current = true;
                setSuggestion(null);
                setSelected(new Set());
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Start over
            </button>
          )}
          {editing ? (
            <Link
              href="/apps/hyperlocal/campaigns"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setSuggestion(null);
                setSelected(new Set());
                userTouched.current = false;
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Change mode
            </button>
          )}
        </div>
      </div>

      {/* Refresh progress bar */}
      {refreshing && (
        <div className="mb-3 space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#F43F5E] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{progressMsg}</p>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Map + control rail, side by side. The rail gives the dials full
          height to breathe instead of floating a tall card over the map. */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <HyperlocalMap
            segments={segments}
            selectedZips={selected}
            onToggleZip={toggleZip}
            pulseZips={suggestion ? new Set(suggestion.zips) : undefined}
            focusZips={suggestion ? new Set(suggestion.zips) : undefined}
            focusNonce={panelKey}
            height={MAP_HEIGHT}
            overlayChip={
              hasSelection
                ? `${selected.size} selected`
                : "Click neighborhoods to build a campaign"
            }
          />
        </div>

        {/* Control rail — fixed to the map height so the bottoms line up. */}
        <div
          className="flex w-full shrink-0 flex-col gap-2 lg:w-[360px]"
          style={{ height: MAP_HEIGHT }}
        >
          {suggestion && mode === "magic" && (
            <div className="shrink-0 rounded-xl border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-3 py-2 text-xs text-foreground">
              <span className="mr-1">✨</span>
              {suggestion.rationale} Tweak it or just hit Send.
            </div>
          )}

          {hasSelection ? (
            <CampaignDialPanel
              key={panelKey}
              mode={mode}
              editing={editing}
              selectedZips={Array.from(selected)}
              sphereZips={zips}
              onLaunch={handleLaunch}
              launching={launching}
              initial={
                editing && editCampaign
                  ? {
                      lens: editCampaign.lens,
                      propertyType: editCampaign.propertyType,
                      priceMin: editCampaign.priceMin,
                      priceMax: editCampaign.priceMax,
                    }
                  : suggestion
                    ? {
                        lens: suggestion.lens,
                        depth: suggestion.depth,
                        reach: suggestion.reach,
                      }
                    : undefined
              }
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
              <p className="text-2xl">🗺️</p>
              <p className="mt-2 text-sm font-medium">Pick your neighborhoods</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Click the ZIPs on the map you want to reach. Your campaign
                controls appear here as you go.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Shared height for the map + control rail so they line up.
const MAP_HEIGHT = "calc(100vh - 230px)";
