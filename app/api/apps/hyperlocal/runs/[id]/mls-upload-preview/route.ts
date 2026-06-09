import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import {
  parseMlsFile,
  detectFormat,
  detectMlsColumns,
} from "@/lib/hyperlocal/mls/parser";

export const dynamic = "force-dynamic";

const MAX_SIZE = 50 * 1024 * 1024;
const SAMPLE_ROW_COUNT = 3;

// ============================================================
// POST /api/apps/hyperlocal/runs/:id/mls-upload-preview
// multipart/form-data: { file }
//
// Parses the MLS file, runs detectMlsColumns, and simulates the
// segment-matching the commit endpoint would do — but writes nothing.
// The UI uses this to show the agent the detected column mapping +
// match preview BEFORE they commit. On confirm, they re-send the file
// to /mls-upload-bulk (optionally with column_overrides) which does
// the storage upload + DB writes.
//
// Sending the file twice (preview + commit) is intentional: it keeps
// the backend stateless between calls and avoids stashing temporary
// files on disk that we'd have to clean up.
// ============================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    .select("id, user_id")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` },
      { status: 400 },
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
      { status: 400 },
    );
  }

  const detected = detectMlsColumns(parsed.columns);

  // Sample rows for visual confirmation — first N rows, with all
  // columns so the modal can show the same row pivoted across the
  // canonical fields the user can pick from.
  const sampleRows = parsed.rows.slice(0, SAMPLE_ROW_COUNT).map((r) =>
    Object.fromEntries(
      parsed.columns.map((col) => [col, String(r[col] ?? "")]),
    ),
  );

  // Match preview — only meaningful when we found a ZIP column.
  // When zip is undetected the modal forces the user to map one
  // before the Commit button enables, so file_zips/match counts are
  // irrelevant at that point.
  let filezipsCount = 0;
  let matched: Array<{
    segment_id: string;
    geo_key: string;
    geo_label: string | null;
    file_row_count: number;
  }> = [];
  let skipped: Array<{
    segment_id: string;
    geo_key: string;
    geo_label: string | null;
  }> = [];
  if (detected.zip) {
    const zipCol = detected.zip;
    const rowsByZip = new Map<string, number>();
    for (const row of parsed.rows) {
      const rawZip = String(row[zipCol] ?? "").trim().toLowerCase();
      if (!rawZip) continue;
      const key = rawZip.split("-")[0];
      rowsByZip.set(key, (rowsByZip.get(key) ?? 0) + 1);
    }
    filezipsCount = rowsByZip.size;

    const { data: pendingSegments } = await service
      .from("hl_segments")
      .select("id, geo_key, geo_label, below_min_size")
      .eq("run_id", runId)
      .in("status", ["pending", "skipped"]);
    for (const seg of (pendingSegments ?? []).filter((s) => !s.below_min_size)) {
      const normKey = String(seg.geo_key).trim().toLowerCase().split("-")[0];
      const count = rowsByZip.get(normKey) ?? 0;
      if (count > 0) {
        matched.push({
          segment_id: seg.id,
          geo_key: seg.geo_key,
          geo_label: seg.geo_label ?? null,
          file_row_count: count,
        });
      } else {
        skipped.push({
          segment_id: seg.id,
          geo_key: seg.geo_key,
          geo_label: seg.geo_label ?? null,
        });
      }
    }
  }

  return Response.json({
    filename: file.name,
    format,
    row_count: parsed.rows.length,
    columns: parsed.columns,
    detected,
    sample_rows: sampleRows,
    file_zips_count: filezipsCount,
    match_preview: { matched, skipped },
  });
}
