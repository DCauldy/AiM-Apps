import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getConnector } from "@/lib/hyperlocal/crm";
import {
  getPlatformCrmConnection,
  getAppCrmConnection,
  listAppCrmConnections,
} from "@/lib/platform/connections";
import { identifyGeographies } from "@/lib/hyperlocal/geographies";

// ============================================================
// Sphere snapshot — a run-INDEPENDENT, ZIP-level tally of where a
// profile's CRM contacts live. This is what paints the map-first
// front door before the user commits to a campaign run.
//
// Unlike runHlDiscover (which is bound to an hl_run, writes
// hl_segments, runs email hygiene, and pulls MLS requirements), this
// is a lightweight read: fetch contacts, bucket by ZIP, tally. The
// result is cached as a JSON blob in the existing hyperlocal-uploads
// storage bucket — one per profile — so we avoid a migration and
// reuse the same caching pattern as the per-run discovery.json.
// ============================================================

const BUCKET = "hyperlocal-uploads";

/** A snapshot is considered fresh for this long before we refresh. */
export const SPHERE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Only 5-digit US ZIPs render as ZCTA polygons on the map. Buyer-side
 *  search_areas can be free-text city names; we keep only true ZIPs so the
 *  sphere paints cleanly and the dial counts stay honest. */
const ZIP_RE = /^\d{5}$/;

export interface SphereZip {
  zip: string;
  contact_count: number;
  seller_count: number;
  buyer_count: number;
}

export interface SphereSnapshot {
  profile_id: string;
  crm_connection_id: string | null;
  total_contacts: number;
  zips: SphereZip[];
  /** ISO timestamp the snapshot was computed. */
  computed_at: string;
}

function snapshotPath(userId: string, profileId: string): string {
  return `${userId}/sphere/${profileId}.json`;
}

/** True when the snapshot is missing or older than the TTL. */
export function isSphereStale(snapshot: SphereSnapshot | null): boolean {
  if (!snapshot) return true;
  const age = Date.now() - new Date(snapshot.computed_at).getTime();
  return Number.isNaN(age) || age > SPHERE_TTL_MS;
}

/** Read the cached snapshot for a profile, or null if none exists. */
export async function readSphereSnapshot(
  userId: string,
  profileId: string,
): Promise<SphereSnapshot | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(snapshotPath(userId, profileId));
  if (error || !data) return null;
  try {
    const text = await data.text();
    return JSON.parse(text) as SphereSnapshot;
  } catch {
    return null;
  }
}

/**
 * Resolve which CRM connection to use for a profile's sphere. Prefers an
 * explicit id; otherwise picks the profile's most-recent Hyperlocal CRM
 * connection. Returns null when the profile has no CRM wired into Hyperlocal.
 */
export async function resolveSphereCrmConnectionId(
  userId: string,
  profileId: string,
  preferredId?: string | null,
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  if (preferredId) {
    const conn = await getAppCrmConnection(
      supabase,
      userId,
      "hyperlocal",
      preferredId,
    );
    if (conn) return preferredId;
  }
  const conns = await listAppCrmConnections(
    supabase,
    userId,
    profileId,
    "hyperlocal",
  );
  // listAppCrmConnections orders by created_at desc — first is most recent.
  // The platform connection id is what hl_runs.crm_connection_id references.
  return conns[0]?.connection.id ?? null;
}

export type SphereProgressStep =
  | "connecting"
  | "fetching"
  | "mapping"
  | "done";

export type SphereProgressFn = (update: {
  step: SphereProgressStep;
  message: string;
  /** 0–100, monotonic. */
  progress: number;
  contactsFetched?: number;
  zipsFound?: number;
}) => void | Promise<void>;

/**
 * Compute a fresh sphere snapshot for a profile and cache it. Optionally
 * reports progress milestones (for SSE streaming on the front door).
 *
 * Returns the snapshot, or null when the profile has no usable CRM
 * connection (the caller renders an "connect your CRM" prompt instead).
 */
export async function computeSphereSnapshot(
  userId: string,
  profileId: string,
  options?: { connectionId?: string | null; onProgress?: SphereProgressFn },
): Promise<SphereSnapshot | null> {
  const onProgress = options?.onProgress;
  const supabase = createServiceRoleClient();

  await onProgress?.({
    step: "connecting",
    message: "Connecting to your CRM…",
    progress: 8,
  });

  const connectionId = await resolveSphereCrmConnectionId(
    userId,
    profileId,
    options?.connectionId,
  );
  if (!connectionId) return null;

  // CRM auth lives on the shared platform row; the Hyperlocal filter config
  // lives on the per-app state row — same split runHlDiscover uses.
  const [platformConn, appCrm] = await Promise.all([
    getPlatformCrmConnection(supabase, userId, connectionId),
    getAppCrmConnection(supabase, userId, "hyperlocal", connectionId),
  ]);
  if (!platformConn) return null;

  await onProgress?.({
    step: "fetching",
    message: "Gathering your contacts…",
    progress: 22,
  });

  const connector = getConnector(platformConn.platform);
  const contacts = await connector.fetchContacts(platformConn, {
    limit: 25_000,
    filter: appCrm?.state.filter_config,
  });

  await onProgress?.({
    step: "mapping",
    message: `Mapping ${contacts.length.toLocaleString()} contacts to neighborhoods…`,
    progress: 64,
    contactsFetched: contacts.length,
  });

  // Reuse the canonical ZIP bucketing. No service-area filter — we want the
  // whole sphere. balanced lens so both seller (home) and buyer (search area)
  // sides are tallied. min_segment_size 1 because we're not gating here.
  const buckets = identifyGeographies(
    contacts,
    { segmentation: "zip", min_segment_size: 1, lens: "balanced" },
    undefined,
  );

  const zips: SphereZip[] = buckets
    .filter((b) => ZIP_RE.test(b.geo_key))
    .map((b) => ({
      zip: b.geo_key,
      contact_count: b.contact_ids.length,
      seller_count: b.seller_contact_ids.length,
      buyer_count: b.buyer_contact_ids.length,
    }))
    .sort((a, b) => b.contact_count - a.contact_count);

  const snapshot: SphereSnapshot = {
    profile_id: profileId,
    crm_connection_id: connectionId,
    total_contacts: contacts.length,
    zips,
    computed_at: new Date().toISOString(),
  };

  // Cache (upsert — one blob per profile).
  await supabase.storage
    .from(BUCKET)
    .upload(snapshotPath(userId, profileId), JSON.stringify(snapshot), {
      contentType: "application/json",
      upsert: true,
    });

  await onProgress?.({
    step: "done",
    message: `Found ${zips.length} neighborhoods across your sphere.`,
    progress: 100,
    contactsFetched: contacts.length,
    zipsFound: zips.length,
  });

  return snapshot;
}
