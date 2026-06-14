import { createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BUCKET = "hyperlocal-uploads";
const RETENTION_DAYS = 60;
const BATCH_SIZE = 500;

/**
 * GET /api/cron/hyperlocal-cleanup
 *
 * Daily Vercel cron. For every hl_mls_uploads row attached to a run that
 * completed (or failed/cancelled) more than RETENTION_DAYS ago AND still
 * has a storage_path set, delete the file from Storage and null the path.
 *
 * The hl_mls_uploads row + hl_market_snapshots stay forever — the snapshot
 * is the durable artifact; the raw CSV is just a recoverable cache that
 * decays to save storage costs as volume grows.
 *
 * Backfill uploads (run_id IS NULL) are intentionally NOT included here —
 * those don't persist files today (see backfill route's `keepFile` flag).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();

  // Find runs that finished long ago. completed_at is set on success +
  // failure + cancellation per run-pipeline.ts.
  const { data: oldRuns } = await supabase
    .from("hl_runs")
    .select("id")
    .lt("completed_at", cutoff)
    .not("completed_at", "is", null)
    .limit(BATCH_SIZE);

  if (!oldRuns || oldRuns.length === 0) {
    return Response.json({ ok: true, runs_scanned: 0, files_deleted: 0 });
  }

  const runIds = oldRuns.map((r) => r.id);
  const { data: uploads } = await supabase
    .from("hl_mls_uploads")
    .select("id, storage_path, run_id")
    .in("run_id", runIds)
    .not("storage_path", "is", null);

  if (!uploads || uploads.length === 0) {
    return Response.json({
      ok: true,
      runs_scanned: oldRuns.length,
      files_deleted: 0,
    });
  }

  // Storage SDK accepts a batch of paths in one delete call.
  const paths = uploads
    .map((u) => u.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  let deleted = 0;
  if (paths.length > 0) {
    const { data: removed, error } = await supabase.storage
      .from(BUCKET)
      .remove(paths);
    if (error) {
      // Don't abort — null what we can, log the rest. Best-effort cleanup is
      // safer than wedging the cron on a transient storage error.
      console.error("[hyperlocal-cleanup] storage.remove error", error.message);
    }
    deleted = removed?.length ?? 0;
  }

  // Null storage_path on the rows we attempted to delete, regardless of
  // whether each individual file existed in Storage — the upload-row stays
  // for audit/lineage, just without the path.
  const uploadIds = uploads.map((u) => u.id);
  await supabase
    .from("hl_mls_uploads")
    .update({ storage_path: null })
    .in("id", uploadIds);

  return Response.json({
    ok: true,
    runs_scanned: oldRuns.length,
    files_deleted: deleted,
    rows_nulled: uploads.length,
  });
}
