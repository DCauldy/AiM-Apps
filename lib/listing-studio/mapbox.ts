// Mapbox Static Images helpers for Listing Studio.
//
// Used as the subject-hero image fallback when RapidAPI returns no usable
// photo for an off-market property. Aerial view conveys lot shape +
// neighborhood density better than a placeholder icon, and we already
// have the Mapbox token (NEXT_PUBLIC_MAPBOX_TOKEN) configured for the
// Hyperlocal app.
//
// Mapbox token is NEXT_PUBLIC_* so this can run on the client.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
// dark-v11 = Mapbox's dark cartographic style. Streets, blocks, parks,
// neighborhood labels — readable at a glance, matches the slate base of
// the Listing Studio theme, and shows the surrounding context an agent
// cares about (cul-de-sac shape, nearby arterials, school districts).
// Satellite-streets-v12 was too photo-busy at the hero size.
const STYLE = "dark-v11";
const ZOOM = 16;

/**
 * Compose a Mapbox satellite-image URL with a gold marker centered on the
 * property. Returns null when token / coords are missing — caller falls
 * back to a placeholder. NB: Mapbox URLs put LON before LAT.
 */
export function listingStudioStaticMapUrl(
  lat: number | null | undefined,
  lon: number | null | undefined,
  opts: { width?: number; height?: number; zoom?: number } = {},
): string | null {
  if (!TOKEN) return null;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const width = Math.min(Math.max(opts.width ?? 640, 64), 1280);
  const height = Math.min(Math.max(opts.height ?? 360, 64), 1280);
  const zoom = opts.zoom ?? ZOOM;

  // Pin color matches the Listing Studio warm-gold accent (#D4A35C).
  const pin = `pin-l+d4a35c(${lon},${lat})`;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/${STYLE}/static/` +
    `${pin}/${lon},${lat},${zoom},0/${width}x${height}@2x` +
    `?access_token=${TOKEN}`
  );
}
