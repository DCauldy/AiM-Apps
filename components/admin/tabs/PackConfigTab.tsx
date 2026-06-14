"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface PackConfig {
  id: string;
  app: string;
  tier: string | null;
  size: number | null;
  frequency: number | null;
  // Hyperlocal-specific meters (also stored in admin_pack_configs).
  // -1 sentinel = unlimited.
  campaigns_limit?: number | null;
  segments_limit?: number | null;
  mls_history_months?: number | null;
  ai_edits_limit?: number | null;
  price_cents: number | null;
  stripe_price_id: string | null;
  label: string | null;
  best_value: boolean;
  is_active: boolean;
  sort_order: number | null;
}

interface PackEdit {
  tier: string;
  price_dollars: string;
  stripe_price_id: string;
  label: string;
  best_value: boolean;
  is_active: boolean;
}

function packToEdit(pack: PackConfig): PackEdit {
  return {
    tier: pack.tier ?? "",
    price_dollars: ((pack.price_cents ?? 0) / 100).toFixed(2),
    stripe_price_id: pack.stripe_price_id ?? "",
    label: pack.label ?? "",
    best_value: pack.best_value,
    is_active: pack.is_active,
  };
}

export function PackConfigTab() {
  const [packs, setPacks] = useState<PackConfig[]>([]);
  const [edits, setEdits] = useState<Record<string, PackEdit>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    prompt_studio: true,
    blog_engine: false,
    radar: false,
    hyperlocal: false,
  });
  const { addToast } = useToast();

  useEffect(() => {
    fetchPacks();
  }, []);

  async function fetchPacks() {
    try {
      const res = await fetch("/api/admin/packs");
      if (!res.ok) throw new Error("Failed to fetch packs");
      const data: PackConfig[] = await res.json();
      setPacks(data);

      const editMap: Record<string, PackEdit> = {};
      for (const pack of data) {
        editMap[pack.id] = packToEdit(pack);
      }
      setEdits(editMap);
    } catch {
      addToast({ title: "Error", description: "Failed to load packs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function updateEdit(packId: string, field: keyof PackEdit, value: string | boolean) {
    setEdits((prev) => ({
      ...prev,
      [packId]: { ...prev[packId], [field]: value },
    }));
  }

  async function savePack(packId: string) {
    const edit = edits[packId];
    if (!edit) return;

    setSaving(packId);

    const priceCents = Math.round(parseFloat(edit.price_dollars) * 100);
    if (isNaN(priceCents) || priceCents < 0) {
      addToast({ title: "Invalid price", variant: "destructive" });
      setSaving(null);
      return;
    }

    try {
      const res = await fetch(`/api/admin/packs/${packId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: edit.tier,
          price_cents: priceCents,
          stripe_price_id: edit.stripe_price_id,
          label: edit.label,
          best_value: edit.best_value,
          is_active: edit.is_active,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      const updated: PackConfig = await res.json();
      setPacks((prev) => prev.map((p) => (p.id === packId ? updated : p)));

      addToast({ title: `Saved ${packId}` });
    } catch {
      addToast({ title: "Error", description: "Failed to save pack", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading packs...</div>;
  }

  const promptPacks = packs.filter((p) => p.app === "prompt_studio");
  const blogPacks = packs.filter((p) => p.app === "blog_engine");
  const hyperlocalPacks = packs.filter((p) => p.app === "hyperlocal");
  const listingStudioPacks = packs.filter((p) => p.app === "listing_studio");
  const radarPacks = packs.filter((p) => p.app === "radar");
  const toursPacks = packs.filter((p) => p.app === "tours");

  return (
    <div className="space-y-3">
      <AccordionSection
        title="Prompt Studio Packs"
        count={promptPacks.length}
        isOpen={openSections.prompt_studio}
        onToggle={() => toggleSection("prompt_studio")}
      >
        <PackGrid
          packs={promptPacks}
          edits={edits}
          saving={saving}
          onUpdate={updateEdit}
          onSave={savePack}
          sizeField="size"
        />
      </AccordionSection>

      <AccordionSection
        title="Blog Engine Packs"
        count={blogPacks.length}
        isOpen={openSections.blog_engine}
        onToggle={() => toggleSection("blog_engine")}
      >
        <PackGrid
          packs={blogPacks}
          edits={edits}
          saving={saving}
          onUpdate={updateEdit}
          onSave={savePack}
          sizeField="frequency"
        />
      </AccordionSection>

      <AccordionSection
        title="Hyperlocal Packs"
        count={hyperlocalPacks.length}
        isOpen={openSections.hyperlocal}
        onToggle={() => toggleSection("hyperlocal")}
      >
        <PackGrid
          packs={hyperlocalPacks}
          edits={edits}
          saving={saving}
          onUpdate={updateEdit}
          onSave={savePack}
          sizeField="hyperlocal"
        />
      </AccordionSection>

      <AccordionSection
        title="CMA Packs"
        count={listingStudioPacks.length}
        isOpen={openSections.listing_studio}
        onToggle={() => toggleSection("listing_studio")}
      >
        <PackGrid
          packs={listingStudioPacks}
          edits={edits}
          saving={saving}
          onUpdate={updateEdit}
          onSave={savePack}
          sizeField="none"
        />
      </AccordionSection>

      <AccordionSection
        title="Radar Packs"
        count={radarPacks.length}
        isOpen={openSections.radar}
        onToggle={() => toggleSection("radar")}
      >
        <PackGrid
          packs={radarPacks}
          edits={edits}
          saving={saving}
          onUpdate={updateEdit}
          onSave={savePack}
          sizeField="none"
        />
      </AccordionSection>

      {toursPacks.length > 0 && (
        <AccordionSection
          title="Tours Packs"
          count={toursPacks.length}
          isOpen={openSections.tours}
          onToggle={() => toggleSection("tours")}
        >
          <PackGrid
            packs={toursPacks}
            edits={edits}
            saving={saving}
            onUpdate={updateEdit}
            onSave={savePack}
            sizeField="tours"
          />
        </AccordionSection>
      )}
    </div>
  );
}

function AccordionSection({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function PackGrid({
  packs,
  edits,
  saving,
  onUpdate,
  onSave,
  sizeField,
}: {
  packs: PackConfig[];
  edits: Record<string, PackEdit>;
  saving: string | null;
  onUpdate: (packId: string, field: keyof PackEdit, value: string | boolean) => void;
  onSave: (packId: string) => void;
  sizeField: "size" | "frequency" | "hyperlocal" | "tours" | "none";
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {packs.map((pack) => {
        const edit = edits[pack.id];
        if (!edit) return null;

        const isPriceTodo =
          !edit.stripe_price_id || edit.stripe_price_id === "price_TODO";

        // `none` is for apps whose admin_pack_configs rows don't carry
        // a size/frequency/meter field — currently Radar + CMA. The
        // per-tier limits live in the lib/<app>-packs.ts files until
        // we add dedicated DB columns for those meters.
        const sizeChip =
          sizeField === "size"
            ? `${pack.size} prompts`
            : sizeField === "frequency"
              ? `${pack.frequency}x/week`
              : sizeField === "tours"
                ? `${pack.size} tours/mo`
                : sizeField === "hyperlocal"
                  ? formatHyperlocalMeters(pack)
                  : "limits in code";

        return (
          <div key={pack.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-muted-foreground">
                {pack.id}
              </span>
              <span className="text-xs text-muted-foreground">{sizeChip}</span>
            </div>

            <div className="grid gap-2">
              <label className="text-xs text-muted-foreground">Tier Name</label>
              <input
                type="text"
                value={edit.tier}
                onChange={(e) => onUpdate(pack.id, "tier", e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs text-muted-foreground">Label</label>
              <input
                type="text"
                value={edit.label}
                onChange={(e) => onUpdate(pack.id, "label", e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs text-muted-foreground">Price ($)</label>
              <input
                type="text"
                value={edit.price_dollars}
                onChange={(e) =>
                  onUpdate(pack.id, "price_dollars", e.target.value)
                }
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs text-muted-foreground">
                Stripe Price ID
              </label>
              <input
                type="text"
                value={edit.stripe_price_id}
                onChange={(e) =>
                  onUpdate(pack.id, "stripe_price_id", e.target.value)
                }
                className={`w-full rounded-md border px-3 py-1.5 text-sm ${
                  isPriceTodo
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400"
                    : "bg-background"
                }`}
              />
              {isPriceTodo && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Needs a real Stripe Price ID before going live
                </p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={edit.best_value}
                  onChange={(e) =>
                    onUpdate(pack.id, "best_value", e.target.checked)
                  }
                  className="rounded"
                />
                Best value
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={edit.is_active}
                  onChange={(e) =>
                    onUpdate(pack.id, "is_active", e.target.checked)
                  }
                  className="rounded"
                />
                Active
              </label>
            </div>

            <button
              onClick={() => onSave(pack.id)}
              disabled={saving === pack.id}
              className="w-full rounded-md bg-foreground text-background py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving === pack.id ? "Syncing..." : "Save"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Hyperlocal packs have 4 numeric meters instead of a single size/frequency.
 *  Compress them into a short summary string for the per-pack header chip. */
function formatHyperlocalMeters(pack: PackConfig): string {
  const fmt = (n: number | null | undefined) =>
    n === -1 ? "∞" : (n ?? "—").toString();
  return `${fmt(pack.campaigns_limit)} runs · ${fmt(pack.segments_limit)} seg · ${fmt(pack.mls_history_months)}mo MLS · ${fmt(pack.ai_edits_limit)} edits`;
}
