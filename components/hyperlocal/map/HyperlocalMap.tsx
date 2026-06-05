"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapboxMap,
  Source,
  Layer,
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
}: HyperlocalMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      });
    }
    return m;
  }, [segments, selectedZips]);

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

  // Fit viewport when GeoJSON loads or selection changes (when fitToSelected)
  useEffect(() => {
    if (!geo || !mapRef.current) return;

    let toFit: GeoJSON.Feature[] = geo.features;
    if (fitToSelected && selectedZips && selectedZips.size > 0) {
      toFit = geo.features.filter((f) => {
        const z = (f.properties as { zip?: string } | null)?.zip;
        return z && selectedZips.has(z);
      });
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
  }, [geo, fitToSelected, selectedZips]);

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
        "relative rounded-lg overflow-hidden border border-border " +
        (className ?? "")
      }
      style={{ height }}
    >
      <MapboxMap
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        initialViewState={{
          longitude: -98.5,
          latitude: 39.5,
          zoom: 3,
        }}
        maxZoom={13}
        interactiveLayerIds={geo ? ["hl-zip-fill"] : []}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovered(null)}
        cursor={onToggleZip && hovered ? "pointer" : undefined}
        style={{ width: "100%", height: "100%" }}
      >
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
