import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { MlsFileFormat } from "@/types/hyperlocal";

export interface ParsedMlsData {
  columns: string[];
  rows: Record<string, unknown>[];
  format: MlsFileFormat;
}

/**
 * Detect format from filename extension or magic-bytes-ish content sniffing.
 */
export function detectFormat(filename: string): MlsFileFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  if (lower.endsWith(".json")) return "json";
  return "csv";
}

/**
 * Parse a buffer (or string) into normalized columns + rows.
 * Auto-detects column headers and trims whitespace.
 */
export function parseMlsFile(
  buffer: Buffer | string,
  format: MlsFileFormat
): ParsedMlsData {
  if (format === "csv") {
    const text = typeof buffer === "string" ? buffer : buffer.toString("utf-8");
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    return {
      columns: result.meta.fields ?? [],
      rows: result.data ?? [],
      format,
    };
  }

  if (format === "xlsx") {
    const wb = XLSX.read(buffer, { type: typeof buffer === "string" ? "string" : "buffer" });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) {
      return { columns: [], rows: [], format };
    }
    const sheet = wb.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    // Column order from the header row
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const columns: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const addr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
      const cell = sheet[addr];
      if (cell && cell.v != null) columns.push(String(cell.v).trim());
    }
    return { columns, rows, format };
  }

  if (format === "json") {
    const text = typeof buffer === "string" ? buffer : buffer.toString("utf-8");
    const data = JSON.parse(text);
    const rows = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : Array.isArray((data as { listings?: unknown[] }).listings)
        ? ((data as { listings: Record<string, unknown>[] }).listings)
        : [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { columns, rows, format };
  }

  return { columns: [], rows: [], format };
}

/**
 * Heuristic detection of common MLS column names.
 * Returns a mapping of canonical metric → actual column name in the file.
 */
export function detectMlsColumns(columns: string[]): {
  price?: string;
  status?: string;
  zip?: string;
  city?: string;
  property_type?: string;
  list_date?: string;
  closed_date?: string;
  days_on_market?: string;
  list_price?: string;
  sold_price?: string;
} {
  const lc = columns.map((c) => ({ raw: c, lower: c.toLowerCase() }));
  const find = (...needles: string[]): string | undefined => {
    for (const n of needles) {
      const hit = lc.find((c) => c.lower.includes(n));
      if (hit) return hit.raw;
    }
    return undefined;
  };
  return {
    price: find("sale price", "sold price", "close price", "price"),
    list_price: find("list price", "listing price", "original price"),
    sold_price: find("sold price", "close price", "sale price"),
    status: find("status"),
    zip: find("zip", "postal"),
    city: find("city"),
    property_type: find("property type", "sub type", "subtype"),
    list_date: find("list date", "listing date"),
    closed_date: find("closed date", "close date", "sold date"),
    days_on_market: find("days on market", "dom", "cdom"),
  };
}
