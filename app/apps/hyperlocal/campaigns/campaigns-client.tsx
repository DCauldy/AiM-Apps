"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Edit3, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import { HyperlocalMap } from "@/components/hyperlocal/map/HyperlocalMap";
import { HyperlocalUpgradeModal } from "@/components/hyperlocal/HyperlocalUpgradeModal";
import type {
  HlCampaign,
  SegmentationType,
  CampaignLens,
} from "@/types/hyperlocal";

// Labels for the campaign card (segmentation + lens). Campaigns are created
// and edited on the map now — there's no field form here.
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
  const [runningId, setRunningId] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<{
    campaignsThisMonth: number;
    campaignsLimit: number;
    periodEnd?: string;
  } | null>(null);

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
        if (json.code === "pack_limit_reached" && json.usage) {
          setUpgrade({
            campaignsThisMonth: json.usage.campaignsThisMonth,
            campaignsLimit: json.usage.campaignsLimit,
            periodEnd: json.usage.periodEnd,
          });
        } else {
          toast.error(json.error ?? "Couldn't start the run.");
        }
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
      <HyperlocalUpgradeModal
        open={!!upgrade}
        onClose={() => setUpgrade(null)}
        reason="limit"
        periodEnd={upgrade?.periodEnd}
        currentUsage={
          upgrade
            ? {
                campaignsThisMonth: upgrade.campaignsThisMonth,
                campaignsLimit: upgrade.campaignsLimit,
              }
            : undefined
        }
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saved configurations you can re-run. Each campaign defines how to
            segment your contacts and which filters to apply.
          </p>
        </div>
        <Button onClick={() => router.push("/apps/hyperlocal/map")}>
          <Plus className="h-4 w-4 mr-2" /> New campaign
        </Button>
      </div>

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
    </div>
  );
}
