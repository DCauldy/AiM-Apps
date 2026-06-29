"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapboxMap,
  Source,
  Layer,
  AttributionControl,
  type MapRef,
  type MapMouseEvent,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  inferStatesFromZips,
  loadZctaForStates,
  filterToZips,
} from "@/lib/hyperlocal/map/geo-loader";
import bbox from "./bbox";

export interface MapSegment {
  zip: string;
  geo_label?: string | null;
  contact_count: number;
  status?: string;
  below_min_size?: boolean;
}

export interface HyperlocalMapProps {
  segments: MapSegment[];
  selectedZips?: Set<string>;             // null/undefined → display-only
  onToggleZip?: (zip: string) => void;
  height?: number | string;
  className?: string;
  /** When true, fits viewport to selected segments only. Otherwise fits to all. */
  fitToSelected?: boolean;
  /** Optional chip rendered top-left over the map (e.g. "10 ZIPs · 5,949 contacts"). */
  overlayChip?: string;
  /** ZIPs to gently pulse (the "opportunity" neighborhoods on the front door).
   *  Default off, so the map's other usages are unaffected. */
  pulseZips?: Set<string>;
  /** ZIPs to zoom/frame the viewport around. Fires once each time
   *  `focusNonce` changes — so the campaign auto-build can frame the cluster
   *  without re-zooming on every manual selection toggle. */
  focusZips?: Set<string>;
  focusNonce?: number;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/**
 * Shared Hyperlocal map component.
 *
 *  - Loads ZCTA GeoJSON for whichever states the segment ZIPs map to.
 *  - Renders each segment ZIP as a filled polygon, color based on selection
 *    state + contact density.
 *  - Optional click-to-toggle if `onToggleZip` is provided.
 *  - Hover tooltips with contact count.
 */
export function HyperlocalMap({
  segments,
  selectedZips,
  onToggleZip,
  height = 420,
  className,
  fitToSelected,
  overlayChip,
  pulseZips,
  focusZips,
  focusNonce,
}: HyperlocalMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track Mapbox's own load lifecycle — calling fitBounds before the
  // map is fully loaded silently no-ops, leaving the view stuck at
  // the initial zoom 3 continental-US framing (what users see as
  // "the whole planet"). Gating the effect on this fixes the race.
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hovered, setHovered] = useState<{
    zip: string;
    label: string;
    count: number;
    selected: boolean;
    x: number;
    y: number;
  } | null>(null);

  // Build a normalized ZIP → metadata map for filtering the GeoJSON
  const zipMetaMap = useMemo(() => {
    const m = new Map<
      string,
      {
        geo_label: string;
        contact_count: number;
        selected: 0 | 1;
        below_min: 0 | 1;
        pulse: 0 | 1;
      }
    >();
    for (const s of segments) {
      const z = String(s.zip).trim().split("-")[0];
      if (!z) continue;
      m.set(z, {
        geo_label: s.geo_label ?? z,
        contact_count: s.contact_count ?? 0,
        selected: selectedZips?.has(z) ? 1 : 0,
        below_min: s.below_min_size ? 1 : 0,
        pulse: pulseZips?.has(z) ? 1 : 0,
      });
    }
    return m;
  }, [segments, selectedZips, pulseZips]);

  // Load + filter GeoJSON for the segments' states
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const states = inferStatesFromZips(segments.map((s) => s.zip));
    if (states.length === 0) {
      setGeo({ type: "FeatureCollection", features: [] });
      setLoading(false);
      return;
    }

    loadZctaForStates(states)
      .then((all) => {
        if (cancelled) return;
        const filtered = filterToZips(all, zipMetaMap);
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[HyperlocalMap] States: ${states.join(",")} | Fetched ${all.features.length} ZCTA features, matched ${filtered.features.length} of ${zipMetaMap.size} target ZIPs`
          );
          if (all.features.length > 0 && filtered.features.length === 0) {
            console.warn(
              "[HyperlocalMap] No matches. Sample fetched feature properties:",
              all.features[0]?.properties
            );
            console.warn(
              "[HyperlocalMap] Target ZIPs (first 5):",
              Array.from(zipMetaMap.keys()).slice(0, 5)
            );
          }
        }
        setGeo(filtered);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Map data failed to load");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // We want to reload geo when segments change but not on every selection
    // toggle. selectedZips changes only repaint the layer below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  // Fit viewport. Depends on mapLoaded so we never call fitBounds before the
  // map's internal state is ready — Mapbox silently drops those calls, which
  // is why some users would see the unzoomed continental view.
  //
  // Critical: the broad "fit to all" must run ONCE per geo load, not on every
  // selection toggle — otherwise clicking a ZIP (which changes selectedZips)
  // re-fits to the whole sphere and zooms the user back out. We track the geo
  // we last fit so re-renders from selection don't re-trigger it. Only the
  // explicit fitToSelected mode re-frames as the selection changes.
  const fittedGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    if (!geo || !mapLoaded || !mapRef.current) return;
    // When a focus target is set, the dedicated focus effect below frames the
    // map instead — skip the broad fit so we don't fight it with a zoom-out.
    if (focusZips && focusZips.size > 0) return;

    let toFit: GeoJSON.Feature[];
    if (fitToSelected && selectedZips && selectedZips.size > 0) {
      // Re-frame to the current selection (intentionally follows clicks).
      toFit = geo.features.filter((f) => {
        const z = (f.properties as { zip?: string } | null)?.zip;
        return z && selectedZips.has(z);
      });
    } else {
      // Broad fit — once per geo only, so clicks don't zoom back out.
      if (fittedGeoRef.current === geo) return;
      fittedGeoRef.current = geo;
      toFit = geo.features;
    }
    if (toFit.length === 0) return;

    const bounds = bbox({ type: "FeatureCollection", features: toFit });
    if (!bounds) return;

    mapRef.current.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 40, duration: 600 }
    );
  }, [geo, fitToSelected, selectedZips, mapLoaded, focusZips]);

  // One-shot focus: zoom/frame the map to a specific cluster of ZIPs each time
  // focusNonce changes (e.g. when the campaign auto-builds). Deliberately keyed
  // on the nonce — NOT focusZips — so manual selection toggles never re-zoom.
  useEffect(() => {
    if (!focusNonce || !focusZips || focusZips.size === 0) return;
    if (!geo || !mapLoaded || !mapRef.current) return;
    const toFit = geo.features.filter((f) => {
      const z = (f.properties as { zip?: string } | null)?.zip;
      return z && focusZips.has(z);
    });
    if (toFit.length === 0) return;
    const bounds = bbox({ type: "FeatureCollection", features: toFit });
    if (!bounds) return;
    mapRef.current.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      // Generous padding + a maxZoom cap so a tight cluster doesn't slam to
      // street level; reads as "here are your picks" without losing context.
      { padding: 80, duration: 800, maxZoom: 10 },
    );
    // focusZips intentionally omitted — fire only on nonce change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce, geo, mapLoaded]);

  // Animate the pulse layer — a slow breathe on the opportunity ZIPs.
  // Cheap: one setPaintProperty pair per frame on a single filtered layer.
  const hasPulse = useMemo(
    () => Array.from(zipMetaMap.values()).some((m) => m.pulse === 1),
    [zipMetaMap],
  );
  useEffect(() => {
    if (!hasPulse || !mapLoaded || !geo || !mapRef.current) return;
    const map = mapRef.current.getMap();
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // ~2.4s period sine, 0..1
      const t = (Math.sin(((now - start) / 2400) * Math.PI * 2) + 1) / 2;
      try {
        if (map.getLayer("hl-zip-pulse")) {
          map.setPaintProperty("hl-zip-pulse", "line-width", 2 + t * 5);
          map.setPaintProperty("hl-zip-pulse", "line-opacity", 0.35 + t * 0.5);
        }
      } catch {
        /* layer not ready this frame */
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasPulse, mapLoaded, geo]);

  const onClick = (e: MapMouseEvent) => {
    if (!onToggleZip) return;
    const feature = e.features?.[0];
    if (!feature) return;
    const zip = (feature.properties as { zip?: string } | null)?.zip;
    if (zip) onToggleZip(zip);
  };

  const onMouseMove = (e: MapMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) {
      setHovered(null);
      return;
    }
    const props = feature.properties as {
      zip?: string;
      geo_label?: string;
      contact_count?: number;
      selected?: number;
    } | null;
    if (!props?.zip) {
      setHovered(null);
      return;
    }
    setHovered({
      zip: props.zip,
      label: props.geo_label ?? props.zip,
      count: props.contact_count ?? 0,
      selected: props.selected === 1,
      x: e.point.x,
      y: e.point.y,
    });
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={
          "rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground " +
          (className ?? "")
        }
        style={{ height }}
      >
        Mapbox token not configured. Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code>.
      </div>
    );
  }

  return (
    <div
      className={
        "hl-map relative rounded-lg overflow-hidden border border-border " +
        (className ?? "")
      }
      style={{ height }}
    >
      <MapboxMap
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        // Disable the default (always-expanded) attribution so we can render
        // a compact ⓘ version below. Required OSM/Mapbox credit is preserved —
        // just collapsed — keeping us within the data license + Mapbox ToS.
        attributionControl={false}
        initialViewState={{
          longitude: -98.5,
          latitude: 39.5,
          zoom: 3,
        }}
        maxZoom={13}
        // For display-only maps (no onToggleZip) lock all pan/zoom/
        // scroll/touch interactions so the embedded map behaves like
        // a static image — no hijacking of page scroll, no accidental
        // pan, no zoom buttons cluttering the chrome. The picker
        // keeps all interactions because the user needs to click ZIPs.
        scrollZoom={!!onToggleZip}
        dragPan={!!onToggleZip}
        dragRotate={false}
        doubleClickZoom={!!onToggleZip}
        boxZoom={!!onToggleZip}
        touchPitch={false}
        touchZoomRotate={!!onToggleZip}
        keyboard={!!onToggleZip}
        interactiveLayerIds={geo ? ["hl-zip-fill"] : []}
        onLoad={() => setMapLoaded(true)}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovered(null)}
        cursor={onToggleZip && hovered ? "pointer" : undefined}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Compact attribution — small ⓘ in the corner that expands on click.
            Keeps the required OSM/Mapbox credit without the wide footer bar. */}
        <AttributionControl compact position="bottom-right" />
        {geo && (
          <Source id="hl-zips" type="geojson" data={geo}>
            <Layer
              id="hl-zip-fill"
              type="fill"
              paint={{
                "fill-color": [
                  "case",
                  ["==", ["get", "selected"], 1],
                  "#F43F5E",
                  ["==", ["get", "below_min"], 1],
                  "#f59e0b",
                  "#1B7FB5",
                ],
                // Toned down ~15% vs first pass — reads as data viz, not
                // a highlighter. Still scales with contact density.
                "fill-opacity": [
                  "interpolate",
                  ["linear"],
                  ["get", "contact_count"],
                  0,
                  0.1,
                  10,
                  0.2,
                  100,
                  0.35,
                  500,
                  0.55,
                  2000,
                  0.7,
                ],
              }}
            />
            <Layer
              id="hl-zip-outline"
              type="line"
              paint={{
                "line-color": [
                  "case",
                  ["==", ["get", "selected"], 1],
                  "#F43F5E",
                  "rgba(255, 255, 255, 0.4)",
                ],
                "line-width": [
                  "case",
                  ["==", ["get", "selected"], 1],
                  2.5,
                  0.5,
                ],
              }}
            />
            {/* Pulsing glow on opportunity ZIPs. line-width/opacity are
                animated each frame by the effect below. Filtered to pulse
                features so non-pulse ZIPs are untouched. */}
            <Layer
              id="hl-zip-pulse"
              type="line"
              filter={["==", ["get", "pulse"], 1]}
              paint={{
                "line-color": "#F43F5E",
                "line-width": 3,
                "line-opacity": 0.6,
                "line-blur": 2,
              }}
            />
            <Layer
              id="hl-zip-labels"
              type="symbol"
              minzoom={9}
              layout={{
                "text-field": ["get", "zip"],
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                "text-size": 11,
              }}
              paint={{
                "text-color": "#ffffff",
                "text-halo-color": "rgba(0,0,0,0.7)",
                "text-halo-width": 1.2,
              }}
            />
          </Source>
        )}
      </MapboxMap>

      {/* Top-left overlay chip (e.g. "10 ZIPs · 5,949 contacts") */}
      {overlayChip && !loading && !error && (
        <div className="absolute top-3 left-3 rounded-md bg-background/85 backdrop-blur border border-border px-2.5 py-1.5 text-xs font-medium pointer-events-none">
          {overlayChip}
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
          <p className="text-xs text-muted-foreground">Loading map data…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="absolute pointer-events-none z-10 rounded-md bg-background/90 backdrop-blur border border-border px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: hovered.x + 10,
            top: hovered.y + 10,
          }}
        >
          <p className="font-semibold">{hovered.label}</p>
          <p className="text-muted-foreground">
            {hovered.count} contact{hovered.count === 1 ? "" : "s"}
            {hovered.selected && (
              <span className="ml-1 text-[#F43F5E]">· selected</span>
            )}
          </p>
        </div>
      )}

      {/* Legend (only when interactive) */}
      {onToggleZip && (
        <div className="absolute bottom-3 left-3 rounded-md bg-background/85 backdrop-blur border border-border px-2.5 py-1.5 text-[10px] flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#F43F5E]" />
            Selected
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#1B7FB5]" />
            Available
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500" />
            Low
          </span>
        </div>
      )}
    </div>
  );
}
