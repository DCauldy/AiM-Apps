"use client";

import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { CRM_PLATFORM_LABELS } from "@/types/hyperlocal";
import type {
  HlCrmConnection,
  CrmPlatform,
  CsvColumnMapping,
  SearchAreaSource,
} from "@/types/hyperlocal";

// All eight platforms are connectable.
const AVAILABLE_PLATFORMS: CrmPlatform[] = [
  "followupboss",
  "lofty",
  "sierra",
  "boldtrail",
  "cinc",
  "cloze",
  "gohighlevel",
  "csv",
];

const PLATFORM_HELP: Record<CrmPlatform, string> = {
  followupboss:
    "Find your API key in Follow Up Boss under Settings → API → Generate New API Key.",
  lofty:
    "Get your API key from Lofty under Settings → API Access (bearer-token auth).",
  sierra:
    "Find your API key in Sierra Interactive under Settings → API. Sent as the Sierra-ApiKey header.",
  boldtrail:
    "BoldTrail (kvCORE): get your bearer token from Settings → Integrations → API. Sent as Bearer auth.",
  cinc: "Get your CINC API key from your account manager. Sent as Bearer auth.",
  cloze: "Cloze API key from Account → API Access. Sent as an api_key query param.",
  gohighlevel:
    "Use a Private Integration Token from GoHighLevel (Settings → Integrations → Private Integrations) plus your Location ID under Advanced.",
  csv: "Upload a CSV export from your CRM. We'll detect columns and ask you to map them.",
};

export function CrmConnectionForm({
  existing,
  onCancel,
  onSaved,
}: {
  existing?: HlCrmConnection;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useHlToast();
  const [platform, setPlatform] = useState<CrmPlatform>(
    existing?.platform ?? "followupboss"
  );
  const [label, setLabel] = useState(existing?.label ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? "");
  const [searchAreaSource, setSearchAreaSource] = useState<SearchAreaSource>(
    existing?.search_area_source ?? "none"
  );
  const [searchAreaColumn, setSearchAreaColumn] = useState(
    existing?.search_area_column ?? ""
  );
  const [searchAreaTagPattern, setSearchAreaTagPattern] = useState(
    existing?.search_area_tag_pattern ?? ""
  );
  const [ghlLocationId, setGhlLocationId] = useState<string>(
    (existing?.column_mapping as { location_id?: string } | null)?.location_id ??
      ""
  );

  const [csvAnalysis, setCsvAnalysis] = useState<{
    storage_path: string;
    filename: string;
    columns: string[];
    sample_rows: Record<string, string>[];
    row_count: number;
  } | null>(null);
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping>(
    existing?.column_mapping ?? {}
  );

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const uploadCsv = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        "/api/apps/hyperlocal/crm-connections/csv-upload",
        { method: "POST", body: form }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setCsvAnalysis(json);
      // Pre-fill obvious mappings
      const guess = (...names: string[]) =>
        json.columns.find((c: string) =>
          names.some((n) => c.toLowerCase().includes(n))
        );
      setCsvMapping((m) => ({
        ...m,
        storage_path: json.storage_path,
        email_column: m.email_column ?? guess("email"),
        first_name_column: m.first_name_column ?? guess("first", "given"),
        last_name_column: m.last_name_column ?? guess("last", "surname"),
        phone_column: m.phone_column ?? guess("phone", "mobile"),
        street_column: m.street_column ?? guess("street", "address 1", "address1"),
        city_column: m.city_column ?? guess("city"),
        state_column: m.state_column ?? guess("state", "province"),
        zip_column: m.zip_column ?? guess("zip", "postal"),
        tags_column: m.tags_column ?? guess("tag"),
        source_column: m.source_column ?? guess("source"),
      }));
      toast.success(`CSV uploaded — ${json.row_count} rows detected`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (platform === "csv" && !csvMapping.email_column) {
      toast.error("Map the email column before saving");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        platform,
        label: label.trim() || null,
        base_url: baseUrl.trim() || null,
        search_area_source: searchAreaSource,
        search_area_column: searchAreaColumn || null,
        search_area_tag_pattern: searchAreaTagPattern || null,
        column_mapping:
          platform === "csv"
            ? csvMapping
            : platform === "gohighlevel" && ghlLocationId.trim()
              ? { location_id: ghlLocationId.trim() }
              : null,
      };
      if (apiKey.trim()) payload.api_key = apiKey.trim();

      const url = existing
        ? `/api/apps/hyperlocal/crm-connections/${existing.id}`
        : "/api/apps/hyperlocal/crm-connections";
      const res = await fetch(url, {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      <h3 className="text-sm font-semibold">
        {existing ? "Edit CRM connection" : "Connect a CRM"}
      </h3>

      <Field label="Platform" required>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as CrmPlatform)}
          disabled={!!existing}
          className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50"
        >
          {AVAILABLE_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {CRM_PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{PLATFORM_HELP[platform]}</p>
      </Field>

      <Field label="Label" hint="Optional. Helpful when you connect multiple accounts.">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`My ${CRM_PLATFORM_LABELS[platform]} account`}
        />
      </Field>

      {/* API key (for non-CSV platforms) */}
      {platform !== "csv" && (
        <Field
          label={existing ? "API key (leave blank to keep current)" : "API key"}
          required={!existing}
        >
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
      )}

      {platform === "lofty" && (
        <Field
          label="Base URL"
          hint="Defaults to https://api.lofty.com/v1 — only change if you're on a regional endpoint."
        >
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.lofty.com/v1"
          />
        </Field>
      )}

      {platform === "gohighlevel" && (
        <Field
          label="Location ID"
          required
          hint="Required — GoHighLevel scopes contacts by location. Copy from your sub-account URL."
        >
          <Input
            value={ghlLocationId}
            onChange={(e) => setGhlLocationId(e.target.value)}
            placeholder="abc123XYZ"
          />
        </Field>
      )}

      {/* CSV upload + mapping */}
      {platform === "csv" && (
        <>
          {!csvAnalysis && !existing?.column_mapping && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Upload your CSV export
              </p>
              <label className="inline-block">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadCsv(f);
                  }}
                />
                <Button
                  variant="outline"
                  disabled={uploading}
                  asChild={false}
                  onClick={(e) => {
                    e.preventDefault();
                    (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
                  }}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" /> Choose CSV
                    </>
                  )}
                </Button>
              </label>
            </div>
          )}

          {csvAnalysis && (
            <div className="rounded-lg border border-border p-4 space-y-3 bg-background">
              <p className="text-xs text-muted-foreground">
                {csvAnalysis.filename} · {csvAnalysis.row_count} rows ·{" "}
                {csvAnalysis.columns.length} columns
              </p>
              <CsvMappingFields
                columns={csvAnalysis.columns}
                mapping={csvMapping}
                onChange={setCsvMapping}
              />
            </div>
          )}
        </>
      )}

      {/* Search area source (advanced) */}
      <details className="rounded-lg border border-border p-4">
        <summary className="text-sm font-medium cursor-pointer">
          Advanced: how to identify a contact's search area
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Search areas tag contacts as buyers interested in a specific geography
            (e.g. ZIP 37027). Leave at "none" if your CRM doesn't track this.
          </p>
          <Field label="Source">
            <select
              value={searchAreaSource}
              onChange={(e) =>
                setSearchAreaSource(e.target.value as SearchAreaSource)
              }
              className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="none">None</option>
              <option value="field">Field / custom column</option>
              <option value="tag-pattern">Tag pattern</option>
            </select>
          </Field>
          {searchAreaSource === "field" && (
            <Field label="Field name">
              <Input
                value={searchAreaColumn}
                onChange={(e) => setSearchAreaColumn(e.target.value)}
                placeholder="e.g. 'searching in' or 'interested_zip'"
              />
            </Field>
          )}
          {searchAreaSource === "tag-pattern" && (
            <Field
              label="Tag pattern"
              hint="Use * as wildcard. Example: 'looking-in-*' matches 'looking-in-37027'."
            >
              <Input
                value={searchAreaTagPattern}
                onChange={(e) => setSearchAreaTagPattern(e.target.value)}
                placeholder="looking-in-*"
              />
            </Field>
          )}
        </div>
      </details>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : existing ? "Save changes" : "Connect"}
        </Button>
      </div>
    </div>
  );
}

function CsvMappingFields({
  columns,
  mapping,
  onChange,
}: {
  columns: string[];
  mapping: CsvColumnMapping;
  onChange: (m: CsvColumnMapping) => void;
}) {
  const set = <K extends keyof CsvColumnMapping>(
    key: K,
    value: CsvColumnMapping[K]
  ) => onChange({ ...mapping, [key]: value });

  const ColumnSelect = ({
    label,
    keyName,
    required,
  }: {
    label: string;
    keyName: keyof CsvColumnMapping;
    required?: boolean;
  }) => (
    <Field label={label} required={required}>
      <select
        value={(mapping[keyName] as string) ?? ""}
        onChange={(e) => set(keyName, e.target.value || undefined)}
        className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
      >
        <option value="">— Not mapped —</option>
        {columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ColumnSelect label="Email" keyName="email_column" required />
      <ColumnSelect label="First name" keyName="first_name_column" />
      <ColumnSelect label="Last name" keyName="last_name_column" />
      <ColumnSelect label="Phone" keyName="phone_column" />
      <ColumnSelect label="Street" keyName="street_column" />
      <ColumnSelect label="City" keyName="city_column" />
      <ColumnSelect label="State" keyName="state_column" />
      <ColumnSelect label="ZIP" keyName="zip_column" />
      <ColumnSelect label="Tags" keyName="tags_column" />
      <ColumnSelect label="Source" keyName="source_column" />
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
