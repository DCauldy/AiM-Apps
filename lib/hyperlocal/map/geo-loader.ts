/**
 * ZIP code (ZCTA) and county boundary loading.
 *
 * We fetch GeoJSON from the OpenDataDE/State-zip-code-GeoJSON public domain
 * project (US Census ZCTA shapes, split per state) via jsDelivr's CDN.
 * Cached client-side per state code so the same state isn't re-fetched.
 *
 * The state must be inferred from the user's contacts BEFORE calling this —
 * loading nationwide ZCTA GeoJSON would be ~700 MB, way too much for client.
 */

const CACHE = new Map<string, Promise<GeoJSON.FeatureCollection>>();

// jsDelivr returns 403 for files over a size threshold from GitHub repos —
// raw.githubusercontent.com has no such cap and supports CORS for public repos.
const ZCTA_BASE =
  "https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/";

/** Lowercase 2-letter state code → filename in the repo. */
const STATE_FILE_MAP: Record<string, string> = {
  ak: "ak_alaska_zip_codes_geo.min.json",
  al: "al_alabama_zip_codes_geo.min.json",
  ar: "ar_arkansas_zip_codes_geo.min.json",
  az: "az_arizona_zip_codes_geo.min.json",
  ca: "ca_california_zip_codes_geo.min.json",
  co: "co_colorado_zip_codes_geo.min.json",
  ct: "ct_connecticut_zip_codes_geo.min.json",
  dc: "dc_district_of_columbia_zip_codes_geo.min.json",
  de: "de_delaware_zip_codes_geo.min.json",
  fl: "fl_florida_zip_codes_geo.min.json",
  ga: "ga_georgia_zip_codes_geo.min.json",
  hi: "hi_hawaii_zip_codes_geo.min.json",
  ia: "ia_iowa_zip_codes_geo.min.json",
  id: "id_idaho_zip_codes_geo.min.json",
  il: "il_illinois_zip_codes_geo.min.json",
  in: "in_indiana_zip_codes_geo.min.json",
  ks: "ks_kansas_zip_codes_geo.min.json",
  ky: "ky_kentucky_zip_codes_geo.min.json",
  la: "la_louisiana_zip_codes_geo.min.json",
  ma: "ma_massachusetts_zip_codes_geo.min.json",
  md: "md_maryland_zip_codes_geo.min.json",
  me: "me_maine_zip_codes_geo.min.json",
  mi: "mi_michigan_zip_codes_geo.min.json",
  mn: "mn_minnesota_zip_codes_geo.min.json",
  mo: "mo_missouri_zip_codes_geo.min.json",
  ms: "ms_mississippi_zip_codes_geo.min.json",
  mt: "mt_montana_zip_codes_geo.min.json",
  nc: "nc_north_carolina_zip_codes_geo.min.json",
  nd: "nd_north_dakota_zip_codes_geo.min.json",
  ne: "ne_nebraska_zip_codes_geo.min.json",
  nh: "nh_new_hampshire_zip_codes_geo.min.json",
  nj: "nj_new_jersey_zip_codes_geo.min.json",
  nm: "nm_new_mexico_zip_codes_geo.min.json",
  nv: "nv_nevada_zip_codes_geo.min.json",
  ny: "ny_new_york_zip_codes_geo.min.json",
  oh: "oh_ohio_zip_codes_geo.min.json",
  ok: "ok_oklahoma_zip_codes_geo.min.json",
  or: "or_oregon_zip_codes_geo.min.json",
  pa: "pa_pennsylvania_zip_codes_geo.min.json",
  ri: "ri_rhode_island_zip_codes_geo.min.json",
  sc: "sc_south_carolina_zip_codes_geo.min.json",
  sd: "sd_south_dakota_zip_codes_geo.min.json",
  tn: "tn_tennessee_zip_codes_geo.min.json",
  tx: "tx_texas_zip_codes_geo.min.json",
  ut: "ut_utah_zip_codes_geo.min.json",
  va: "va_virginia_zip_codes_geo.min.json",
  vt: "vt_vermont_zip_codes_geo.min.json",
  wa: "wa_washington_zip_codes_geo.min.json",
  wi: "wi_wisconsin_zip_codes_geo.min.json",
  wv: "wv_west_virginia_zip_codes_geo.min.json",
  wy: "wy_wyoming_zip_codes_geo.min.json",
};

/**
 * Infer the US states most relevant to a set of ZIP codes.
 * Uses the ZIP-to-state numeric prefix rules (loose; some boundaries are
 * fuzzy but good enough for picking which GeoJSON files to load).
 */
export function inferStatesFromZips(zips: string[]): string[] {
  const counts = new Map<string, number>();
  for (const z of zips) {
    const prefix = String(z).trim().slice(0, 3);
    const state = ZIP_PREFIX_TO_STATE[prefix];
    if (state) {
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
  }
  // Return states sorted by count desc, capped at top 4 to avoid loading
  // half the country for an agent with online leads everywhere.
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([state]) => state);
}

/**
 * Loads and caches the ZCTA GeoJSON for a single state.
 * Returns a FeatureCollection where each feature has properties.ZCTA5CE10
 * (or ZCTA5CE20) containing the ZIP code as a string.
 */
export async function loadZctaForState(
  stateCode: string
): Promise<GeoJSON.FeatureCollection> {
  const lower = stateCode.toLowerCase();
  const filename = STATE_FILE_MAP[lower];
  if (!filename) {
    return { type: "FeatureCollection", features: [] };
  }
  if (CACHE.has(lower)) return CACHE.get(lower)!;

  const promise = fetch(ZCTA_BASE + filename, { cache: "force-cache" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load ${filename}: ${res.status}`);
      return (await res.json()) as GeoJSON.FeatureCollection;
    })
    .catch((err) => {
      CACHE.delete(lower);  // allow retry
      throw err;
    });

  CACHE.set(lower, promise);
  return promise;
}

/**
 * Load a merged FeatureCollection covering all of `states`. Failed states
 * silently drop out of the merge.
 */
export async function loadZctaForStates(
  states: string[]
): Promise<GeoJSON.FeatureCollection> {
  const results = await Promise.allSettled(
    states.map((s) => loadZctaForState(s))
  );
  const features: GeoJSON.Feature[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") features.push(...r.value.features);
  }
  return { type: "FeatureCollection", features };
}

/**
 * Extract the ZIP code from a ZCTA feature. Different Census vintages and
 * third-party repos use different property names (ZCTA5CE10, ZCTA5CE20,
 * GEOID10, ZIPCODE, ZIP_CODE, etc.) — we try the well-known ones first, then
 * fall back to scanning every property for any 5-digit numeric value.
 */
export function getZipFromFeature(f: GeoJSON.Feature): string | null {
  const props = f.properties as Record<string, unknown> | null;
  if (!props) return null;

  const candidates = [
    props.ZCTA5CE20,
    props.ZCTA5CE10,
    props.ZCTA5,
    props.GEOID20,
    props.GEOID10,
    props.GEOID,
    props.ZIPCODE,
    props.ZIP_CODE,
    props.ZIP,
    props.zip,
    props.zip_code,
  ];
  for (const c of candidates) {
    const z = normalizeZip(c);
    if (z) return z;
  }

  // Fallback — scan every property for a value that looks like a 5-digit ZIP
  for (const v of Object.values(props)) {
    const z = normalizeZip(v);
    if (z) return z;
  }
  return null;
}

function normalizeZip(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  const m = /^(\d{5})(?:-\d{4})?$/.exec(s);
  return m ? m[1] : null;
}

/**
 * Filter a ZCTA collection down to just the ZIPs we care about, normalizing
 * each feature's properties to a stable shape: { zip, ...extra }.
 */
export function filterToZips<T extends Record<string, unknown>>(
  collection: GeoJSON.FeatureCollection,
  zipsWithMeta: Map<string, T>
): GeoJSON.FeatureCollection {
  const matched: GeoJSON.Feature[] = [];
  for (const f of collection.features) {
    const zip = getZipFromFeature(f);
    if (!zip) continue;
    const meta = zipsWithMeta.get(zip);
    if (!meta) continue;
    matched.push({
      ...f,
      properties: { zip, ...meta },
    });
  }
  return { type: "FeatureCollection", features: matched };
}

// ---------------------------------------------------------------------------
// ZIP-prefix → state lookup (rough but sufficient for picking which states'
// GeoJSON to load). Source: USPS prefix table.
// ---------------------------------------------------------------------------

const ZIP_PREFIX_TO_STATE: Record<string, string> = (() => {
  const ranges: Array<[number, number, string]> = [
    [0, 27, "ma"],
    [28, 29, "ri"],
    [30, 38, "nh"],
    [39, 49, "me"],
    [50, 54, "vt"],
    [55, 59, "ma"],
    [60, 69, "ct"],
    [70, 89, "nj"],
    [90, 99, "pr"],
    [100, 149, "ny"],
    [150, 196, "pa"],
    [197, 199, "de"],
    [200, 205, "dc"],
    [206, 219, "md"],
    [220, 246, "va"],
    [247, 268, "wv"],
    [270, 289, "nc"],
    [290, 299, "sc"],
    [300, 319, "ga"],
    [320, 349, "fl"],
    [350, 369, "al"],
    [370, 385, "tn"],
    [386, 397, "ms"],
    [398, 399, "ga"],
    [400, 427, "ky"],
    [430, 459, "oh"],
    [460, 479, "in"],
    [480, 499, "mi"],
    [500, 528, "ia"],
    [530, 549, "wi"],
    [550, 567, "mn"],
    [570, 577, "sd"],
    [580, 588, "nd"],
    [590, 599, "mt"],
    [600, 629, "il"],
    [630, 658, "mo"],
    [660, 679, "ks"],
    [680, 693, "ne"],
    [700, 714, "la"],
    [716, 729, "ar"],
    [730, 749, "ok"],
    [750, 799, "tx"],
    [800, 816, "co"],
    [820, 831, "wy"],
    [832, 838, "id"],
    [840, 847, "ut"],
    [850, 865, "az"],
    [870, 884, "nm"],
    [889, 898, "nv"],
    [900, 961, "ca"],
    [967, 968, "hi"],
    [970, 979, "or"],
    [980, 994, "wa"],
    [995, 999, "ak"],
  ];
  const out: Record<string, string> = {};
  for (const [lo, hi, state] of ranges) {
    for (let i = lo; i <= hi; i++) {
      out[String(i).padStart(3, "0")] = state;
    }
  }
  return out;
})();
