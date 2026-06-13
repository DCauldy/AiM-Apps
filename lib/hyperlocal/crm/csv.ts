import Papa from "papaparse";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  NormalizedContact,
  CsvColumnMapping,
} from "@/types/hyperlocal";
import type {
  HlCrmFilterConfig,
  PlatformCrmConnection,
} from "@/types/platform-connections";
import type {
  CrmConnector,
  FetchContactsOptions,
  TestConnectionResult,
} from "./types";
import { dedupeByEmail, extractSearchAreas, isValidEmail } from "./normalize";

const BUCKET = "hyperlocal-uploads";

async function downloadCsvText(storagePath: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Could not download CSV: ${error?.message ?? "missing file"}`);
  }
  return await data.text();
}

function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = result.data ?? [];
  const columns = result.meta.fields ?? [];
  return { columns, rows };
}

function rowToContact(
  filter: HlCrmFilterConfig | undefined,
  row: Record<string, string>,
  mapping: CsvColumnMapping,
  rowIndex: number
): NormalizedContact | null {
  const email = mapping.email_column
    ? row[mapping.email_column]?.trim().toLowerCase()
    : undefined;
  if (!email || !isValidEmail(email)) return null;

  const first = mapping.first_name_column ? row[mapping.first_name_column] ?? "" : "";
  const last = mapping.last_name_column ? row[mapping.last_name_column] ?? "" : "";

  // Address — either combined or split
  let home: NormalizedContact["home_address"];
  if (mapping.combined_address_column) {
    const combined = row[mapping.combined_address_column];
    if (combined) home = { street: combined };
  } else {
    home = {
      street: mapping.street_column ? row[mapping.street_column] : undefined,
      city: mapping.city_column ? row[mapping.city_column] : undefined,
      state: mapping.state_column ? row[mapping.state_column] : undefined,
      zip: mapping.zip_column ? row[mapping.zip_column] : undefined,
    };
    if (!home.street && !home.city && !home.zip) home = undefined;
  }

  const tags = mapping.tags_column && row[mapping.tags_column]
    ? row[mapping.tags_column].split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
    : [];

  const searchFieldValue = filter?.search_area_column
    ? row[filter.search_area_column]
    : undefined;

  return {
    external_id: `csv-${rowIndex}`,
    first_name: first.trim(),
    last_name: last.trim(),
    email,
    phone: mapping.phone_column ? row[mapping.phone_column] : undefined,
    home_address: home,
    search_areas: extractSearchAreas(filter, searchFieldValue, tags),
    tags,
    source: mapping.source_column ? row[mapping.source_column] : "csv",
  };
}

export const csvConnector: CrmConnector = {
  async testConnection(
    _conn: PlatformCrmConnection,
    filter?: HlCrmFilterConfig,
  ): Promise<TestConnectionResult> {
    try {
      const mapping = filter?.column_mapping;
      if (!mapping?.storage_path) {
        return { ok: false, error: "No CSV file uploaded yet" };
      }
      if (!mapping.email_column) {
        return { ok: false, error: "Email column not mapped" };
      }
      const text = await downloadCsvText(mapping.storage_path);
      const { rows } = parseCsv(text);
      const firstRow = rows[0];
      const sample = firstRow
        ? rowToContact(filter, firstRow, mapping, 0) ?? undefined
        : undefined;
      return {
        ok: true,
        sample,
        contact_count_estimate: rows.length,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  async fetchContacts(
    _conn: PlatformCrmConnection,
    opts: FetchContactsOptions = {}
  ): Promise<NormalizedContact[]> {
    const mapping = opts.filter?.column_mapping;
    if (!mapping?.storage_path) {
      throw new Error("CSV not uploaded for this connection");
    }
    if (!mapping.email_column) {
      throw new Error("Email column not mapped");
    }
    const text = await downloadCsvText(mapping.storage_path);
    const { rows } = parseCsv(text);

    const cap = opts.limit ?? rows.length;
    const out: NormalizedContact[] = [];
    for (let i = 0; i < Math.min(rows.length, cap); i++) {
      const n = rowToContact(opts.filter, rows[i], mapping, i);
      if (n) out.push(n);
    }
    return dedupeByEmail(out);
  },
};

/**
 * Helper for the CSV upload endpoint — given uploaded text, returns column
 * detection and the first few rows so the UI can ask the user to confirm
 * the mapping before we save it.
 */
export function analyzeCsv(text: string): {
  columns: string[];
  sample_rows: Record<string, string>[];
  row_count: number;
} {
  const { columns, rows } = parseCsv(text);
  return {
    columns,
    sample_rows: rows.slice(0, 5),
    row_count: rows.length,
  };
}
