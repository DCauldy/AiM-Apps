import { createClient } from "@/lib/supabase/server";
import { triggerSphereRefresh } from "@/lib/hyperlocal/run-pipeline";
import {
  readSphereSnapshot,
  isSphereStale,
  resolveSphereCrmConnectionId,
} from "@/lib/hyperlocal/sphere";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/sphere
 *
 * The map-first front door's data source. Returns the cached sphere snapshot
 * immediately (instant paint) and, when the cache is stale or missing — or
 * ?refresh=1 is passed — kicks off a background recompute, returning the
 * Trigger.dev run id so the client can stream the "lighting up" progress.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: meta } = await supabase
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .single();
  const profileId = meta?.active_profile_id;
  if (!profileId) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const snapshot = await readSphereSnapshot(user.id, profileId);
  const stale = force || isSphereStale(snapshot);

  if (!stale) {
    return Response.json({ snapshot, refreshing: false, connected: true });
  }

  // Stale/missing — confirm there's a CRM to pull from before firing a task.
  const connectionId = await resolveSphereCrmConnectionId(user.id, profileId);
  if (!connectionId) {
    return Response.json({
      snapshot,
      refreshing: false,
      connected: false,
    });
  }

  let runId: string | null = null;
  try {
    runId = await triggerSphereRefresh({
      userId: user.id,
      profileId,
      connectionId,
    });
  } catch {
    // Couldn't enqueue — still hand back whatever's cached so the map paints.
    return Response.json({ snapshot, refreshing: false, connected: true });
  }

  return Response.json({ snapshot, refreshing: true, connected: true, runId });
}
