import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { parseMlsFile, detectFormat, detectMlsColumns } from "@/lib/hyperlocal/mls/parser";
import { computeMetrics } from "@/lib/hyperlocal/mls/metrics";

export const dynamic = "force-dynamic";

const BUCKET = "hyperlocal-uploads";
const MAX_SIZE = 50 * 1024 * 1024;

/**
 * POST /api/apps/hyperlocal/runs/:id/mls-upload-bulk
 * multipart/form-data: { file }
 *
 * Single-upload mode: user gives us ONE MLS export covering their service
 * area. We parse it once, group rows by ZIP, compute per-ZIP metrics, and
 * attach the metrics to whichever pending segments match.
 *
 * Segments with no matching rows in the file get marked `skipped` — meaning
 * the user has contacts there but no MLS coverage, so we treat it as
 * out-of-market and don't generate an email.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: run } = await service
    .from("hl_runs")
    .select("id, user_id, phase")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  // Parse the file
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
  let parsed;
  try {
    parsed = parseMlsFile(buffer, format);
  } catch (e) {
    return Response.json(
      {
        error: `Could not parse file: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      },
      { status: 400 }
    );
  }

  // We need a ZIP column to split by ZIP
  const detected = detectMlsColumns(parsed.columns);
  if (!detected.zip) {
    return Response.json(
      {
        error:
          "Couldn't find a ZIP column in your file. Make sure your MLS export includes a 'Zip' or 'Postal' column.",
        columns: parsed.columns,
      },
      { status: 400 }
    );
  }
  const zipCol = detected.zip;

  // Upload the raw file to storage so we have it for audit / re-parse
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storagePath = `${user.id}/${runId}/mls-bulk-${Date.now()}-${safeName}`;
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

  const { data: uploadRow, error: uploadInsertErr } = await service
    .from("hl_mls_uploads")
    .insert({
      run_id: runId,
      user_id: user.id,
      filename: file.name,
      storage_path: storagePath,
      file_size_bytes: file.size,
      detected_format: format,
      detected_columns: { columns: parsed.columns, detected },
      row_count: parsed.rows.length,
    })
    .select()
    .single();
  if (uploadInsertErr) {
    return Response.json({ error: uploadInsertErr.message }, { status: 500 });
  }

  // Group rows by ZIP (normalized lowercase string with whitespace trimmed)
  const rowsByZip = new Map<string, Record<string, unknown>[]>();
  for (const row of parsed.rows) {
    const rawZip = String(row[zipCol] ?? "").trim().toLowerCase();
    if (!rawZip) continue;
    // Normalize "37027-1234" → "37027" for ZIP+4
    const key = rawZip.split("-")[0];
    if (!rowsByZip.has(key)) rowsByZip.set(key, []);
    rowsByZip.get(key)!.push(row);
  }

  // Load all pending segments for this run
  const { data: pendingSegments } = await service
    .from("hl_segments")
    .select("id, geo_key, contact_count, below_min_size")
    .eq("run_id", runId)
    .eq("status", "pending");

  let matchedCount = 0;
  let skippedCount = 0;
  let matchedContactCount = 0;
  let skippedContactCount = 0;
  const updatePromises: Promise<unknown>[] = [];

  for (const seg of pendingSegments ?? []) {
    const normalizedSegKey = String(seg.geo_key).trim().toLowerCase().split("-")[0];
    const matchingRows = rowsByZip.get(normalizedSegKey);

    if (matchingRows && matchingRows.length > 0) {
      const metrics = computeMetrics(matchingRows, parsed.columns);
      matchedCount += 1;
      matchedContactCount += seg.contact_count;
      updatePromises.push(
        Promise.resolve(
          service
            .from("hl_segments")
            .update({
              mls_upload_id: uploadRow.id,
              mls_metrics: metrics,
              status: "ready",
            })
            .eq("id", seg.id)
        )
      );
    } else {
      skippedCount += 1;
      skippedContactCount += seg.contact_count;
      updatePromises.push(
        Promise.resolve(
          service
            .from("hl_segments")
            .update({ status: "skipped" })
            .eq("id", seg.id)
        )
      );
    }
  }

  await Promise.all(updatePromises);

  return Response.json({
    upload: uploadRow,
    summary: {
      file_rows: parsed.rows.length,
      file_zips: rowsByZip.size,
      matched_segments: matchedCount,
      matched_contacts: matchedContactCount,
      skipped_segments: skippedCount,
      skipped_contacts: skippedContactCount,
    },
  });
}
