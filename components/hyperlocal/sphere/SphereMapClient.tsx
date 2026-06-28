"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HyperlocalMap, type MapSegment } from "@/components/hyperlocal/map/HyperlocalMap";
import {
  CampaignDialPanel,
  type DialValues,
} from "@/components/hyperlocal/sphere/CampaignDialPanel";
import {
  suggestCampaign,
  type CampaignSuggestion,
} from "@/lib/hyperlocal/sphere-suggest";
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

export function SphereMapClient() {
  const router = useRouter();
  const [zips, setZips] = useState<SphereZip[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The pre-built campaign suggestion (the "we built this for you" magic).
  const [suggestion, setSuggestion] = useState<CampaignSuggestion | null>(null);
  // Remount key so the dial panel re-seeds from a fresh suggestion.
  const [panelKey, setPanelKey] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  // Once the user clicks the map themselves, we stop auto-building.
  const userTouched = useRef(false);

  // Pre-light the densest neighborhoods + pre-set the dials from the sphere.
  const applySuggestion = useCallback((snapshot: SphereSnapshot) => {
    const sugg = suggestCampaign(snapshot);
    if (!sugg) return;
    setSuggestion(sugg);
    setSelected(new Set(sugg.zips));
    setPanelKey((k) => k + 1);
  }, []);

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
            if (!userTouched.current) applySuggestion(data.snapshot);
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
          if (!userTouched.current) applySuggestion(data.snapshot);
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
      try {
        const res = await fetch("/api/apps/hyperlocal/sphere/launch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zips: Array.from(selected),
            lens: values.lens,
            reach: values.reach,
            depth: values.depth,
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
    [selected, router],
  );

  const segments = zipsToSegments(zips);
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

  return (
    <div className="relative">
      {/* Header line */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Your sphere</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading your neighborhoods…"
              : `${zips.length} neighborhood${zips.length === 1 ? "" : "s"} · ${totalContacts.toLocaleString()} contacts`}
          </p>
        </div>
        {hasSelection && (
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

      <div className="relative">
        <HyperlocalMap
          segments={segments}
          selectedZips={selected}
          onToggleZip={toggleZip}
          pulseZips={
            suggestion ? new Set(suggestion.zips) : undefined
          }
          height="calc(100vh - 230px)"
          overlayChip={
            hasSelection
              ? `${selected.size} selected`
              : "Click neighborhoods to build a campaign"
          }
        />

        {/* Dial panel floats over the map's bottom-right when a selection exists */}
        {hasSelection && (
          <div className="absolute bottom-4 right-4 z-20 w-[340px] max-w-[calc(100%-2rem)] space-y-2">
            {suggestion && (
              <div className="rounded-xl border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-3 py-2 text-xs text-foreground backdrop-blur">
                <span className="mr-1">✨</span>
                {suggestion.rationale} Tweak it or just hit Send.
              </div>
            )}
            <CampaignDialPanel
              key={panelKey}
              selectedZips={Array.from(selected)}
              sphereZips={zips}
              onLaunch={handleLaunch}
              launching={launching}
              initial={
                suggestion
                  ? {
                      lens: suggestion.lens,
                      depth: suggestion.depth,
                      reach: suggestion.reach,
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
