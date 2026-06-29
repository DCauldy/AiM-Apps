import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { parseMlsFile, detectFormat, detectMlsColumns } from "@/lib/hyperlocal/mls/parser";
import { computeMetrics } from "@/lib/hyperlocal/mls/metrics";
import {
  computeMonthlySnapshots,
  upsertSnapshots,
  type MonthlySnapshot,
} from "@/lib/hyperlocal/mls/snapshots";

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
    .select("id, user_id, phase, profile_id")
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

  // Auto-detect, then layer the user's confirmed overrides on top.
  // The mapping-confirmation modal posts overrides as a JSON string in
  // the `column_overrides` form field. Any canonical the user pinned
  // wins over auto-detection — only undefined override keys fall
  // through to the heuristic.
  const autoDetected = detectMlsColumns(parsed.columns);
  let overrides: Partial<typeof autoDetected> = {};
  const overridesRaw = form.get("column_overrides");
  if (typeof overridesRaw === "string" && overridesRaw.trim()) {
    try {
      const parsedOverrides = JSON.parse(overridesRaw) as Record<string, unknown>;
      // Whitelist the canonical keys + only accept string values that
      // actually exist in the file's column list.
      const allowed = new Set([
        "price",
        "list_price",
        "sold_price",
        "status",
        "zip",
        "city",
        "property_type",
        "list_date",
        "closed_date",
        "days_on_market",
      ] as const);
      const columnsSet = new Set(parsed.columns);
      for (const [k, v] of Object.entries(parsedOverrides)) {
        if (!allowed.has(k as never)) continue;
        if (typeof v === "string" && columnsSet.has(v)) {
          (overrides as Record<string, string>)[k] = v;
        }
      }
    } catch {
      return Response.json(
        { error: "column_overrides must be valid JSON" },
        { status: 400 },
      );
    }
  }
  const detected = { ...autoDetected, ...overrides };

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

  // Load segments that still need data. "skipped" is included so that
  // a follow-up upload can fill segments missed by a prior upload —
  // crucial for MLS systems with low per-export caps where agents do
  // 3–5 separate exports to cover all their ZIPs.
  const { data: pendingSegments } = await service
    .from("hl_segments")
    .select("id, geo_key, geo_label, geo_type, contact_count, below_min_size")
    .eq("run_id", runId)
    .in("status", ["pending", "skipped"]);

  let matchedCount = 0;
  let skippedCount = 0;
  let matchedContactCount = 0;
  let skippedContactCount = 0;
  const updatePromises: Promise<unknown>[] = [];
  const allSnapshots: MonthlySnapshot[] = [];

  for (const seg of pendingSegments ?? []) {
    const normalizedSegKey = String(seg.geo_key).trim().toLowerCase().split("-")[0];
    const matchingRows = rowsByZip.get(normalizedSegKey);

    if (matchingRows && matchingRows.length > 0) {
      const metrics = computeMetrics(matchingRows, parsed.columns, detected);
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

      // Permanent monthly snapshots — let the renderer talk about trends
      // ("up 4.2% YoY") rather than only the current month's slice.
      if (run.profile_id) {
        const snapshots = computeMonthlySnapshots(
          matchingRows,
          parsed.columns,
          {
            key: seg.geo_key,
            label: seg.geo_label ?? null,
            type: seg.geo_type ?? null,
          },
          detected,
        );
        allSnapshots.push(...snapshots);
      }
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

  if (run.profile_id && allSnapshots.length > 0) {
    // Best-effort: snapshot persistence shouldn't fail the upload.
    await upsertSnapshots(service, run.profile_id, uploadRow.id, allSnapshots).catch(
      (e) => console.error("[mls-upload-bulk] snapshot upsert failed", e),
    );
  }

  return Response.json({
    upload: uploadRow,
    summary: {
      file_rows: parsed.rows.length,
      file_zips: rowsByZip.size,
      matched_segments: matchedCount,
      matched_contacts: matchedContactCount,
      skipped_segments: skippedCount,
      skipped_contacts: skippedContactCount,
      snapshots_upserted: allSnapshots.length,
    },
  });
}
