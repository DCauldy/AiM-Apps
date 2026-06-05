import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { parseMlsFile, detectFormat } from "@/lib/hyperlocal/mls/parser";
import { computeMetrics } from "@/lib/hyperlocal/mls/metrics";

export const dynamic = "force-dynamic";

const BUCKET = "hyperlocal-uploads";
const MAX_SIZE = 50 * 1024 * 1024;  // 50 MB

/**
 * POST /api/apps/hyperlocal/runs/:id/segments/:segmentId/mls-upload
 * multipart/form-data: { file: File }
 *
 * Uploads MLS export, parses it, computes metrics, and persists to the
 * segment. If :segmentId === "all" the rows are NOT auto-assigned (future
 * work — for now we recommend per-segment uploads).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  const { id: runId, segmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Ownership check
  const service = createServiceRoleClient();
  const { data: run } = await service
    .from("hl_runs")
    .select("id, user_id, phase")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  // Verify segment belongs to this run
  const { data: segment } = await service
    .from("hl_segments")
    .select("id, geo_key, geo_label")
    .eq("id", segmentId)
    .eq("run_id", runId)
    .maybeSingle();
  if (!segment) {
    return Response.json({ error: "Segment not found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const format = detectFormat(file.name);

  // Parse + compute metrics
  let parsed;
  try {
    parsed = parseMlsFile(buffer, format);
  } catch (e) {
    return Response.json(
      {
        error: `Could not parse file: ${e instanceof Error ? e.message : "unknown error"}`,
      },
      { status: 400 }
    );
  }
  const metrics = computeMetrics(parsed.rows, parsed.columns);

  // Upload to storage
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storagePath = `${user.id}/${runId}/mls-${segment.geo_key}-${Date.now()}-${safeName}`;
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType:
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv",
      upsert: false,
    });
  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  // Insert upload row
  const { data: upload, error: insertErr } = await service
    .from("hl_mls_uploads")
    .insert({
      run_id: runId,
      user_id: user.id,
      filename: file.name,
      storage_path: storagePath,
      file_size_bytes: file.size,
      detected_format: format,
      detected_columns: { columns: parsed.columns },
      row_count: parsed.rows.length,
    })
    .select()
    .single();
  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  // Link to segment + persist metrics
  await service
    .from("hl_segments")
    .update({
      mls_upload_id: upload.id,
      mls_metrics: metrics,
      status: "ready",
    })
    .eq("id", segmentId);

  return Response.json({
    upload,
    metrics,
    row_count: parsed.rows.length,
    columns: parsed.columns,
  });
}
