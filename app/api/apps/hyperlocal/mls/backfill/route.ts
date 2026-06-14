import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { parseMlsFile, detectFormat, detectMlsColumns } from "@/lib/hyperlocal/mls/parser";
import {
  computeMonthlySnapshots,
  upsertSnapshots,
  type MonthlySnapshot,
} from "@/lib/hyperlocal/mls/snapshots";

export const dynamic = "force-dynamic";

const MAX_SIZE = 50 * 1024 * 1024;

/**
 * POST /api/apps/hyperlocal/mls/backfill
 * multipart/form-data: { file }
 *
 * Historical MLS upload — outside any campaign run. We parse the file, group
 * rows by ZIP, compute monthly snapshots per ZIP, and upsert into
 * hl_market_snapshots. Re-uploading a month overwrites cleanly via the
 * unique-constraint upsert.
 *
 * We DO NOT persist the raw file — backfill is about distilling history into
 * the snapshots table, not maintaining an archive. (Run-driven uploads still
 * keep the file in Storage for audit + re-render.) If you want raw retention,
 * flip the `keepFile` constant.
 */
const keepFile = false;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!meta?.active_profile_id) {
    return Response.json(
      { error: "Set an active profile before uploading historical data." },
      { status: 400 },
    );
  }
  const profileId = meta.active_profile_id;

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
      { error: `Could not parse file: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const detected = detectMlsColumns(parsed.columns);
  if (!detected.zip) {
    return Response.json(
      {
        error:
          "Couldn't find a ZIP column. Backfill needs a 'Zip' or 'Postal' column to bucket rows by geo.",
        columns: parsed.columns,
      },
      { status: 400 },
    );
  }
  if (!detected.closed_date && !detected.list_date) {
    return Response.json(
      {
        error:
          "Couldn't find a closed-date or list-date column. Historical snapshots need a date to anchor to a month.",
        columns: parsed.columns,
      },
      { status: 400 },
    );
  }

  // Optional file persistence (default off — backfill is distillation, not archive)
  let uploadRowId: string | null = null;
  if (keepFile) {
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const storagePath = `${user.id}/backfill/${Date.now()}-${safeName}`;
    await service.storage.from("hyperlocal-uploads").upload(storagePath, buffer, {
      contentType: format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv",
      upsert: false,
    });
    const { data: row } = await service
      .from("hl_mls_uploads")
      .insert({
        run_id: null,
        user_id: user.id,
        profile_id: profileId,
        source: "backfill",
        filename: file.name,
        storage_path: storagePath,
        file_size_bytes: file.size,
        detected_format: format,
        detected_columns: { columns: parsed.columns, detected },
        row_count: parsed.rows.length,
      })
      .select("id")
      .single();
    uploadRowId = row?.id ?? null;
  }

  // Group rows by ZIP (same normalization as the run-bulk path)
  const rowsByZip = new Map<string, Record<string, unknown>[]>();
  for (const row of parsed.rows) {
    const rawZip = String(row[detected.zip] ?? "").trim().toLowerCase();
    if (!rawZip) continue;
    const key = rawZip.split("-")[0];
    if (!rowsByZip.has(key)) rowsByZip.set(key, []);
    rowsByZip.get(key)!.push(row);
  }

  // Compute snapshots per ZIP and accumulate
  const allSnapshots: MonthlySnapshot[] = [];
  const coverage = new Map<string, Set<string>>(); // zip -> set of "YYYY-M"
  for (const [zip, rows] of rowsByZip) {
    const snaps = computeMonthlySnapshots(rows, parsed.columns, {
      key: zip,
      label: zip,
      type: "zip",
    });
    allSnapshots.push(...snaps);
    for (const s of snaps) {
      if (!coverage.has(zip)) coverage.set(zip, new Set());
      coverage.get(zip)!.add(`${s.period_year}-${s.period_month}`);
    }
  }

  await upsertSnapshots(service, profileId, uploadRowId, allSnapshots);

  return Response.json({
    summary: {
      filename: file.name,
      file_rows: parsed.rows.length,
      zips: rowsByZip.size,
      snapshots_upserted: allSnapshots.length,
      months_covered: Array.from(coverage.values()).reduce(
        (acc, set) => acc + set.size,
        0,
      ),
    },
    coverage: Array.from(coverage.entries()).map(([zip, months]) => ({
      zip,
      month_count: months.size,
    })),
  });
}

/**
 * GET /api/apps/hyperlocal/mls/backfill
 * Returns the per-geo coverage already accumulated for the active profile.
 * Powers the "Coverage so far" section of the Settings tab.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!meta?.active_profile_id) {
    return Response.json({ coverage: [] });
  }

  const { data } = await service
    .from("hl_market_snapshots")
    .select("geo_key, period_year, period_month")
    .eq("profile_id", meta.active_profile_id);

  const byGeo = new Map<string, { earliest: string; latest: string; count: number }>();
  for (const r of (data ?? []) as Array<{
    geo_key: string;
    period_year: number;
    period_month: number;
  }>) {
    const key = `${r.period_year}-${String(r.period_month).padStart(2, "0")}`;
    const existing = byGeo.get(r.geo_key);
    if (!existing) {
      byGeo.set(r.geo_key, { earliest: key, latest: key, count: 1 });
    } else {
      existing.count += 1;
      if (key < existing.earliest) existing.earliest = key;
      if (key > existing.latest) existing.latest = key;
    }
  }

  const coverage = Array.from(byGeo.entries())
    .map(([geo_key, v]) => ({ geo_key, ...v }))
    .sort((a, b) => b.count - a.count);

  return Response.json({ coverage });
}
