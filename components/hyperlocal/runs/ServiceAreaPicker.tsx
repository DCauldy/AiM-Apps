"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowRight, AlertTriangle, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { HyperlocalMap } from "@/components/hyperlocal/map/HyperlocalMap";

interface SegmentSummary {
  id: string;
  geo_key: string;
  geo_label: string | null;
  geo_type: string | null;
  contact_count: number;
  seller_contact_count: number;
  buyer_contact_count: number;
  below_min_size: boolean;
}

/**
 * Default pre-checks: top N segments by contact count that are above the
 * min-size threshold. Caps at this many checked by default.
 */
const DEFAULT_TOP_N = 10;

/**
 * Hyperlocal won't generate more than this many emails per run, even if the
 * user tries to select more. Mirrors the cap inside hl-generate.
 */
const HARD_CAP = 30;

export function ServiceAreaPicker({
  runId,
  onContinue,
}: {
  runId: string;
  onContinue: () => void;
}) {
  const toast = useHlToast();
  const [segments, setSegments] = useState<SegmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [minContacts, setMinContacts] = useState(0);
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/service-area`
      );
      const json = await res.json();
      const list = (json.segments ?? []) as SegmentSummary[];
      setSegments(list);
      // Pre-check the top N full-size segments (by contact count)
      const top = list
        .filter((s) => !s.below_min_size)
        .slice(0, DEFAULT_TOP_N)
        .map((s) => s.geo_key);
      setSelected(new Set(top));
      setLoading(false);
    })();
  }, [runId]);

  // Filtered + min-contacts view
  const visibleSegments = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return segments.filter((s) => {
      if (s.contact_count < minContacts) return false;
      if (!q) return true;
      const key = String(s.geo_key).toLowerCase();
      const label = (s.geo_label ?? "").toLowerCase();
      return key.includes(q) || label.includes(q);
    });
  }, [segments, filter, minContacts]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of visibleSegments) next.add(s.geo_key);
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  const totalSelectedContacts = useMemo(() => {
    let total = 0;
    for (const s of segments) {
      if (selected.has(s.geo_key)) total += s.contact_count;
    }
    return total;
  }, [segments, selected]);

  const overCap = selected.size > HARD_CAP;

  const submit = async () => {
    if (selected.size === 0) {
      toast.error("Pick at least one ZIP");
      return;
    }
    if (overCap) {
      toast.error(`Hyperlocal limits runs to ${HARD_CAP} ZIPs at a time`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/service-area`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zips: Array.from(selected),
            save_as_default: saveAsDefault,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success(
        `Continuing with ${json.selected} segment${json.selected === 1 ? "" : "s"}`
      );
      onContinue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <Loader2 className="h-6 w-6 mx-auto text-muted-foreground animate-spin" />
      </div>
    );
  }

  // Map adapter: build segment list for the map + click handler that
  // mirrors the checkbox toggle
  const mapSegments = useMemo(
    () =>
      segments.map((s) => ({
        zip: s.geo_key,
        geo_label: s.geo_label,
        contact_count: s.contact_count,
        below_min_size: s.below_min_size,
      })),
    [segments]
  );

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold">Pick your service area</p>
        <p className="text-xs text-muted-foreground mt-1">
          Found <span className="font-medium">{segments.length}</span> ZIPs in
          your CRM. Click a ZIP on the map or check it in the list — we'll only
          generate emails for the ones you pick. Save your selection as the
          default for this campaign.
        </p>
      </div>

      {/* Map */}
      <div className="px-5 py-4 border-b border-border">
        <HyperlocalMap
          segments={mapSegments}
          selectedZips={selected}
          onToggleZip={toggle}
          height={460}
          overlayChip={`${selected.size} of ${segments.length} ZIP${segments.length === 1 ? "" : "s"} selected`}
        />
      </div>

      {/* Controls */}
      <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter ZIPs…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Min contacts</label>
          <Input
            type="number"
            min={0}
            value={minContacts}
            onChange={(e) => setMinContacts(parseInt(e.target.value, 10) || 0)}
            className="h-9 w-20 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={selectAllVisible}>
          Select all visible
        </Button>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          Clear
        </Button>
      </div>

      {/* List */}
      <div className="max-h-[400px] overflow-y-auto">
        <ul className="divide-y divide-border">
          {visibleSegments.map((s) => {
            const isSelected = selected.has(s.geo_key);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(s.geo_key)}
                  className={`w-full text-left px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/40 ${
                    isSelected ? "bg-[#F43F5E]/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex items-center justify-center w-4 h-4 rounded border ${
                        isSelected
                          ? "bg-[#E11D48] border-[#E11D48]"
                          : "border-border"
                      } shrink-0`}
                    >
                      {isSelected && (
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {s.geo_label || s.geo_key}
                        </p>
                        {s.below_min_size && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            <AlertTriangle className="h-2.5 w-2.5" /> Low
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {s.contact_count} contact
                        {s.contact_count === 1 ? "" : "s"}
                        {s.seller_contact_count > 0 &&
                          ` · ${s.seller_contact_count} seller`}
                        {s.buyer_contact_count > 0 &&
                          ` · ${s.buyer_contact_count} buyer`}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {visibleSegments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No ZIPs match the filter.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs">
            <p>
              <span className="font-semibold">{selected.size}</span> ZIPs
              selected ·{" "}
              <span className="font-semibold">
                {totalSelectedContacts.toLocaleString()}
              </span>{" "}
              contacts
              {overCap && (
                <span className="text-destructive ml-2">
                  Max {HARD_CAP} per run — uncheck some
                </span>
              )}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
            />
            Save as default for this campaign
          </label>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={submit}
            disabled={saving || selected.size === 0 || overCap}
            className="bg-[#E11D48] hover:bg-[#BE123C]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              <>
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
