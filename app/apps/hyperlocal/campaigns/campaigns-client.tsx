"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Edit3, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import { HyperlocalMap } from "@/components/hyperlocal/map/HyperlocalMap";
import type {
  HlCampaign,
  SegmentationType,
  CampaignLens,
} from "@/types/hyperlocal";

interface FormState {
  name: string;
  segmentation: SegmentationType;
  lens: CampaignLens;
  min_segment_size: number;
  price_range_low: string;
  price_range_high: string;
  property_type_filters: string;
  service_area_zips: string;        // comma/space-separated input
}

const EMPTY: FormState = {
  name: "",
  segmentation: "zip",
  lens: "balanced",
  min_segment_size: 3,
  price_range_low: "",
  price_range_high: "",
  property_type_filters: "",
  service_area_zips: "",
};

const SEGMENTATION_OPTIONS: { value: SegmentationType; label: string }[] = [
  { value: "zip", label: "ZIP code" },
  { value: "city", label: "City" },
  { value: "county", label: "County" },
  { value: "subdivision", label: "Subdivision" },
  { value: "neighborhood", label: "Neighborhood" },
  { value: "custom", label: "Custom field" },
];

const LENS_OPTIONS: { value: CampaignLens; label: string }[] = [
  { value: "seller", label: "Seller-focused" },
  { value: "buyer", label: "Buyer-focused" },
  { value: "balanced", label: "Balanced (both)" },
];

/** Campaign + the most-recent-run timestamp the list API attaches. */
type CampaignWithMeta = HlCampaign & { last_run_at?: string | null };

/** "Jun 28, 2026" — compact absolute date for the last-run line. */
function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CampaignsClient({
  initialCampaigns,
}: {
  initialCampaigns: CampaignWithMeta[];
}) {
  const toast = useHlToast();
  const { confirm, dialog } = useHlDialog();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/apps/hyperlocal/campaigns");
    const json = await res.json();
    setCampaigns(json.campaigns ?? []);
  };

  // One-click run: launch straight into the Magic experience using the
  // profile's default CRM + sender — no dialog.
  const runCampaign = async (c: HlCampaign) => {
    setRunningId(c.id);
    try {
      const res = await fetch(`/api/apps/hyperlocal/campaigns/${c.id}/run`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.runId) {
        toast.error(json.error ?? "Couldn't start the run.");
        return;
      }
      window.dispatchEvent(new Event("hyperlocal-usage-updated"));
      router.push(`/apps/hyperlocal/runs/${json.runId}?magic=1`);
    } catch {
      toast.error("Couldn't start the run.");
    } finally {
      setRunningId(null);
    }
  };

  const startEdit = (c: HlCampaign) => {
    setEditingId(c.id);
    setCreating(false);
    setForm({
      name: c.name,
      segmentation: c.segmentation,
      lens: c.lens,
      min_segment_size: c.min_segment_size,
      price_range_low: c.price_range_low?.toString() ?? "",
      price_range_high: c.price_range_high?.toString() ?? "",
      property_type_filters: c.property_type_filters.join(", "),
      service_area_zips: (c.service_area_zips ?? []).join(", "),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCreating(false);
    setForm(EMPTY);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        segmentation: form.segmentation,
        lens: form.lens,
        min_segment_size: form.min_segment_size,
        price_range_low: form.price_range_low
          ? parseInt(form.price_range_low, 10)
          : null,
        price_range_high: form.price_range_high
          ? parseInt(form.price_range_high, 10)
          : null,
        property_type_filters: form.property_type_filters
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        service_area_zips: form.service_area_zips
          .split(/[,\s]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      };
      const url = editingId
        ? `/api/apps/hyperlocal/campaigns/${editingId}`
        : "/api/apps/hyperlocal/campaigns";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      await refresh();
      toast.success(editingId ? "Campaign updated" : "Campaign created");
      cancelEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Delete this campaign?",
      message:
        "Run history is retained but the saved configuration goes away. You can recreate it later.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/apps/hyperlocal/campaigns/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    toast.success("Campaign deleted");
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      {dialog}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saved configurations you can re-run. Each campaign defines how to
            segment your contacts and which filters to apply.
          </p>
        </div>
        {!creating && !editingId && (
          <Button onClick={() => router.push("/apps/hyperlocal/map")}>
            <Plus className="h-4 w-4 mr-2" /> New campaign
          </Button>
        )}
      </div>

      {(creating || editingId) && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold">
            {editingId ? "Edit campaign" : "New campaign"}
          </h3>

          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Brentwood Sellers Monthly"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Segmentation"
              value={form.segmentation}
              onChange={(v) =>
                setForm((f) => ({ ...f, segmentation: v as SegmentationType }))
              }
              options={SEGMENTATION_OPTIONS}
            />
            <Select
              label="Lens"
              value={form.lens}
              onChange={(v) =>
                setForm((f) => ({ ...f, lens: v as CampaignLens }))
              }
              options={LENS_OPTIONS}
            />
          </div>

          <Field
            label="Minimum segment size"
            hint="Segments with fewer contacts get rolled up into a parent geography."
          >
            <Input
              type="number"
              min={1}
              value={form.min_segment_size}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  min_segment_size: parseInt(e.target.value, 10) || 1,
                }))
              }
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Price range low ($)">
              <Input
                type="number"
                value={form.price_range_low}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price_range_low: e.target.value }))
                }
                placeholder="e.g. 400000"
              />
            </Field>
            <Field label="Price range high ($)">
              <Input
                type="number"
                value={form.price_range_high}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price_range_high: e.target.value }))
                }
                placeholder="e.g. 900000"
              />
            </Field>
          </div>

          <Field
            label="Property types"
            hint="Comma-separated. Leave blank for all types."
          >
            <Input
              value={form.property_type_filters}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  property_type_filters: e.target.value,
                }))
              }
              placeholder="single_family, condo, townhouse"
            />
          </Field>

          <Field
            label="Service area ZIPs"
            hint="The ZIPs you actually do business in. Leave blank to pick from your CRM after each run. Comma- or space-separated."
          >
            <Input
              value={form.service_area_zips}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  service_area_zips: e.target.value,
                }))
              }
              placeholder="37027, 37064, 37067"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create"}
            </Button>
          </div>
        </div>
      )}

      {!creating && !editingId && (
        <>
          {campaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No campaigns yet. Head to Launch to build one on the map.
              </p>
              <Button onClick={() => router.push("/apps/hyperlocal/map")}>
                <Plus className="h-4 w-4 mr-2" /> New campaign
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {campaigns.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0 flex gap-4">
                    {/* Small map preview if a service area is saved */}
                    {(c.service_area_zips?.length ?? 0) > 0 && (
                      <div className="w-32 sm:w-48 shrink-0 hidden sm:block">
                        <HyperlocalMap
                          segments={c.service_area_zips.map((z) => ({
                            zip: z,
                            contact_count: 1,
                          }))}
                          selectedZips={new Set(c.service_area_zips)}
                          height={96}
                          className="rounded-md"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {SEGMENTATION_OPTIONS.find(
                          (s) => s.value === c.segmentation
                        )?.label}{" "}
                        ·{" "}
                        {
                          LENS_OPTIONS.find((l) => l.value === c.lens)
                            ?.label
                        }
                        {(c.service_area_zips?.length ?? 0) > 0
                          ? ` · ${c.service_area_zips.length} service ZIPs`
                          : " · pick service area each run"}
                        {c.property_type_filters.length > 0 &&
                          ` · ${c.property_type_filters.length} property type${c.property_type_filters.length === 1 ? "" : "s"}`}
                      </p>

                      {/* The actual ZIP codes so the campaign is identifiable */}
                      {(c.service_area_zips?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {c.service_area_zips.slice(0, 8).map((z) => (
                            <span
                              key={z}
                              className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
                            >
                              {z}
                            </span>
                          ))}
                          {c.service_area_zips.length > 8 && (
                            <span className="px-1 py-0.5 text-[11px] text-muted-foreground">
                              +{c.service_area_zips.length - 8} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Last run / never run */}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {(c as CampaignWithMeta).last_run_at
                          ? `Last run ${formatRunDate((c as CampaignWithMeta).last_run_at as string)}`
                          : "Never run"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runCampaign(c)}
                      disabled={runningId === c.id}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      {runningId === c.id ? "Starting…" : "Run"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        router.push(`/apps/hyperlocal/map?campaign=${c.id}`)
                      }
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(c.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
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

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
