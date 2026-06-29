/**
 * Server-side helper that builds a Mapbox Static Images API URL for a single
 * ZIP polygon. The result is embedded as an <img src="..."> inside generated
 * emails so recipients see a real neighborhood map of their area.
 *
 *   https://docs.mapbox.com/api/maps/static-images/
 *
 * Cost: 50K static-image requests / month are free. At 10 emails per run, a
 * weekly run for 1000 Pro users still fits in the free tier.
 */

import simplify from "@turf/simplify";
import bbox from "@turf/bbox";
import {
  inferStatesFromZips,
  loadZctaForState,
  getZipFromFeature,
} from "./geo-loader";

const STATIC_API = "https://api.mapbox.com/styles/v1";
const DEFAULT_STYLE = "mapbox/light-v11";   // email images read better light
const FILL_COLOR = "F43F5E";
const FILL_OPACITY = 0.35;
const STROKE_COLOR = "BE123C";
const STROKE_WIDTH = 2;

/** Width/height in display pixels (rendered at 2x for retina) */
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 240;

/** Limits ensuring the URL stays under Mapbox's 8192-char cap. */
const MAX_VERTICES = 80;

interface BuildOpts {
  zip: string;
  /** Mapbox public access token (NEXT_PUBLIC_MAPBOX_TOKEN). */
  token: string;
  width?: number;
  height?: number;
  /** Override style (e.g. for dark-mode emails). */
  style?: string;
}

/**
 * Build the static map URL for one ZIP. Returns null if we couldn't find the
 * polygon (state lookup failed, network failed, etc.) — the caller should
 * gracefully fall back to no-map in that case rather than break the email.
 */
export async function buildStaticMapUrl(
  opts: BuildOpts
): Promise<string | null> {
  const { zip, token, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, style = DEFAULT_STYLE } = opts;
  if (!token) return null;
  const normalizedZip = zip.trim().split("-")[0];

  // Determine which state the ZIP belongs to
  const states = inferStatesFromZips([normalizedZip]);
  if (states.length === 0) return null;

  // Load the state's ZCTA collection and find this ZIP's feature
  let feature: GeoJSON.Feature | null = null;
  try {
    const collection = await loadZctaForState(states[0]);
    feature = collection.features.find((f) => getZipFromFeature(f) === normalizedZip) ?? null;
  } catch {
    return null;
  }
  if (!feature || !feature.geometry) return null;

  // Simplify the polygon so it fits in a URL
  const simplified = simplifyForUrl(feature);
  if (!simplified) return null;

  // Compute viewport from the polygon's bbox
  const [minLon, minLat, maxLon, maxLat] = bbox(simplified) as [
    number,
    number,
    number,
    number,
  ];
  // Auto-fit by passing `auto` for center+zoom — Mapbox figures it out
  // from the overlay extent + a 60px padding.

  // Encode the polygon as a GeoJSON overlay
  const overlay = encodeGeoJsonOverlay(simplified);
  if (!overlay) return null;

  // Stay under 8192-char URL limit (Mapbox enforces this)
  const candidate = `${STATIC_API}/${style}/static/${overlay}/auto/${width}x${height}@2x?access_token=${token}&padding=40`;
  if (candidate.length > 8000) {
    // Try a tighter simplification + smaller image
    const tighter = simplifyForUrl(feature, 0.005);
    if (tighter) {
      const tighterOverlay = encodeGeoJsonOverlay(tighter);
      const retry = `${STATIC_API}/${style}/static/${tighterOverlay}/auto/${width}x${height}@2x?access_token=${token}&padding=40`;
      if (retry.length <= 8000) return retry;
    }
    return null;
  }

  // Reference _ to mark variables as intentionally read but not used below
  void minLon;
  void minLat;
  void maxLon;
  void maxLat;

  return candidate;
}

/**
 * Reduce a polygon to a small number of vertices via Douglas-Peucker.
 * Tweaks tolerance up until vertex count fits in our cap.
 */
function simplifyForUrl(
  feature: GeoJSON.Feature,
  initialTolerance = 0.0015
): GeoJSON.Feature | null {
  if (!feature.geometry) return null;
  let tolerance = initialTolerance;
  let attempt = simplify(feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, {
    tolerance,
    highQuality: false,
  });
  let count = countVertices(attempt);

  // Keep loosening until we're under the cap
  while (count > MAX_VERTICES && tolerance < 0.05) {
    tolerance *= 1.6;
    attempt = simplify(
      feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
      { tolerance, highQuality: false }
    );
    count = countVertices(attempt);
  }
  return attempt as GeoJSON.Feature;
}

function countVertices(f: GeoJSON.Feature): number {
  let n = 0;
  const walk = (g: GeoJSON.Geometry | null) => {
    if (!g) return;
    switch (g.type) {
      case "Polygon":
        for (const ring of g.coordinates) n += ring.length;
        return;
      case "MultiPolygon":
        for (const poly of g.coordinates)
          for (const ring of poly) n += ring.length;
        return;
      default:
        return;
    }
  };
  walk(f.geometry);
  return n;
}

/**
 * Build a Mapbox "geojson(...)" overlay string with our styling applied.
 * Mapbox Static API accepts any valid GeoJSON Feature with `properties`
 * controlling fill/stroke styling via simplestyle-spec.
 */
function encodeGeoJsonOverlay(feature: GeoJSON.Feature): string | null {
  // simplestyle-spec — Mapbox respects these properties when rendering
  const styled = {
    ...feature,
    properties: {
      fill: "#" + FILL_COLOR,
      "fill-opacity": FILL_OPACITY,
      stroke: "#" + STROKE_COLOR,
      "stroke-width": STROKE_WIDTH,
      "stroke-opacity": 1,
    },
  };
  try {
    const json = JSON.stringify(styled);
    return `geojson(${encodeURIComponent(json)})`;
  } catch {
    return null;
  }
}
