import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { NextRequest } from "next/server";
import type { RawComp } from "@/lib/listing-studio/rapidapi";

export const dynamic = "force-dynamic";

// ============================================================
// POST /api/apps/listing-studio/listings/[id]/comps-upload
//
// Accepts either:
//   - multipart/form-data with a `file` field, OR
//   - application/json with `{ csv: string }`
//
// Stores raw CSV + a best-effort parsed_rows JSONB so the CMA pipeline
// can reuse the upload without re-parsing. v1 parser is header + split-by-
// comma — good enough for MLS exports the agent has cleaned themselves.
// A richer parser (papaparse, quoted fields, etc.) can swap in later.
// ============================================================

const NUMERIC_FIELDS = new Set([
  "beds",
  "baths",
  "living_area_sqft",
  "lot_area_sqft",
  "year_built",
  "sold_price_cents",
  "distance_mi",
]);

const FIELD_ALIASES: Record<string, keyof RawComp> = {
  address: "address",
  zip: "zip",
  zipcode: "zip",
  "zip code": "zip",
  beds: "beds",
  bedrooms: "beds",
  baths: "baths",
  bathrooms: "baths",
  sqft: "living_area_sqft",
  "living area": "living_area_sqft",
  living_area_sqft: "living_area_sqft",
  lot: "lot_area_sqft",
  lot_size: "lot_area_sqft",
  lot_area_sqft: "lot_area_sqft",
  year: "year_built",
  year_built: "year_built",
  "property type": "property_type",
  property_type: "property_type",
  sold_price: "sold_price_cents",
  "sold price": "sold_price_cents",
  price: "sold_price_cents",
  sold_date: "sold_date",
  "sold date": "sold_date",
  distance: "distance_mi",
  distance_mi: "distance_mi",
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/^"|"$/g, "");
}

function parseNumber(v: string): number | null {
  const cleaned = v.replace(/[,$"]/g, "").trim();
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseCsvToComps(csv: string): RawComp[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(normHeader);
  const rows: RawComp[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length === 0) continue;

    const raw: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      raw[h] = cells[idx] ?? "";
    });

    const comp: RawComp = {
      address: null,
      zip: null,
      beds: null,
      baths: null,
      living_area_sqft: null,
      lot_area_sqft: null,
      year_built: null,
      property_type: null,
      garage_spaces: null,
      sold_price_cents: null,
      sold_date: null,
      distance_mi: null,
      image_url: null,
      zpid: null,
      raw,
    };

    for (const h of headers) {
      const field = FIELD_ALIASES[h];
      if (!field) continue;
      const cell = String(raw[h] ?? "");
      if (!cell) continue;

      if (field === "sold_price_cents") {
        const n = parseNumber(cell);
        comp.sold_price_cents = n != null ? Math.round(n * 100) : null;
      } else if (NUMERIC_FIELDS.has(field)) {
        (comp as unknown as Record<string, number | null>)[field] = parseNumber(cell);
      } else {
        (comp as unknown as Record<string, string | null>)[field] = cell;
      }
    }

    rows.push(comp);
  }

  return rows;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Ownership check.
  const service = createServiceRoleClient();
  const { data: listing } = await service
    .from("ls_listings")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  let csv = "";
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "file is required" }, { status: 400 });
    }
    csv = await file.text();
  } else {
    const body = await req.json().catch(() => ({}));
    csv = typeof body?.csv === "string" ? body.csv : "";
  }

  csv = csv.trim();
  if (!csv) {
    return Response.json({ error: "Empty CSV." }, { status: 400 });
  }

  const parsed = parseCsvToComps(csv);
  if (parsed.length === 0) {
    return Response.json(
      { error: "No comp rows parsed. Check the CSV header and try again." },
      { status: 400 },
    );
  }

  const { data: inserted, error } = await service
    .from("ls_comps_uploads")
    .insert({
      listing_id: id,
      raw_csv: csv,
      parsed_rows: parsed,
      row_count: parsed.length,
      uploaded_at: new Date().toISOString(),
    })
    .select("id, row_count, uploaded_at")
    .single();

  if (error || !inserted) {
    return Response.json(
      { error: error?.message ?? "Failed to save upload" },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    uploadId: inserted.id,
    rowCount: inserted.row_count,
    uploadedAt: inserted.uploaded_at,
  });
}
