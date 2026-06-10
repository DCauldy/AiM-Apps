"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  DollarSign,
  FileText,
  Camera,
  Mail,
  Sparkles,
  Loader2,
  Lock,
  AlertCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { DescriptionTab } from "@/components/listing-studio/description/DescriptionTab";
import { CmaTab } from "@/components/listing-studio/cma/CmaTab";
import { PhotosTab } from "@/components/listing-studio/photos/PhotosTab";
import { HtmlEmailTab } from "@/components/listing-studio/emails/HtmlEmailTab";
import type {
  ListingRow,
  ListingStage,
  PropertyFacts,
} from "@/types/listing-studio";

type Tab = "overview" | "cma" | "description" | "photos" | "html";

// Tabs are split into two groups:
//   - "prospect" tabs available before promotion (Overview, CMA)
//   - "active" tabs unlocked once the listing is promoted
//
// DOTW (Deal of the Week email) was dropped from v1 — Hyperlocal already
// owns "personal emails to your sphere" with actual sending, CRM
// integration, and per-recipient personalization. Code preserved at
// commit history if we ever want to bring it back.
const TABS: { id: Tab; label: string; icon: React.ReactNode; activeOnly?: boolean }[] = [
  { id: "overview", label: "Overview", icon: <Building2 className="h-3.5 w-3.5" /> },
  { id: "cma", label: "CMA", icon: <DollarSign className="h-3.5 w-3.5" /> },
  { id: "description", label: "Description", icon: <FileText className="h-3.5 w-3.5" />, activeOnly: true },
  { id: "photos", label: "Photos", icon: <Camera className="h-3.5 w-3.5" />, activeOnly: true },
  { id: "html", label: "HTML Email", icon: <Mail className="h-3.5 w-3.5" />, activeOnly: true },
];

export function WorkspaceClient({ listing: initialListing }: { listing: ListingRow }) {
  const router = useRouter();
  const [listing, setListing] = useState(initialListing);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const isActive = listing.stage === "active";
  const isArchived = listing.stage === "archived";

  // Backfill the subject hero image + coords (+ zpid if missing) for
  // listings created before those fields existed. Fires whenever the
  // hero is incomplete — doesn't require a pre-existing zpid since the
  // lookup can recover one from the address. One-shot per mount;
  // re-fires if listing.id changes (workspace navigated). Failures are
  // silent.
  useEffect(() => {
    const facts = listing.property_facts ?? {};
    const hasImage = !!facts.image_url;
    const hasCoords =
      typeof facts.latitude === "number" && typeof facts.longitude === "number";
    const hasZpid = !!facts.zpid;
    if (hasImage && hasCoords && hasZpid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "/api/apps/listing-studio/property-lookup",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: listing.address }),
          },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.facts) return;
        // Merge — never overwrite a field the user already corrected
        // (e.g. they manually fixed beds in Overview, don't clobber it).
        const next: PropertyFacts = {
          ...facts,
          zpid: facts.zpid ?? data.facts.zpid ?? undefined,
          image_url: facts.image_url ?? data.facts.image_url ?? undefined,
          latitude: facts.latitude ?? data.facts.latitude ?? undefined,
          longitude: facts.longitude ?? data.facts.longitude ?? undefined,
        };
        const patchRes = await fetch(
          `/api/apps/listing-studio/listings/${listing.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ property_facts: next }),
          },
        );
        if (patchRes.ok) {
          const updated = await patchRes.json();
          if (!cancelled) setListing(updated.listing);
        }
      } catch {
        // Best-effort — no user-facing surface for failure here.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  async function handlePromote() {
    setPromoting(true);
    setPromoteError(null);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/listings/${listing.id}/promote`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setPromoteError(
            `Monthly listing limit reached (${data.usage?.activeListingsPromoted ?? "?"}/${data.usage?.activeListingsLimit ?? "?"}). Upgrade your pack for more.`,
          );
        } else {
          setPromoteError(data.error ?? "Promote failed");
        }
        return;
      }
      setListing(data.listing);
      window.dispatchEvent(new Event("listing-studio-usage-updated"));
    } catch {
      setPromoteError("Network error — try again.");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Back + header */}
        <div className="space-y-3">
          <Link
            href="/apps/listing-studio/listings"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Listings
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-sans text-xl font-bold text-foreground truncate">
                {listing.address}
              </h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <StagePill stage={listing.stage} />
                <FactsSummary listing={listing} />
              </div>
            </div>
            {listing.stage === "prospect" && (
              <button
                type="button"
                onClick={handlePromote}
                disabled={promoting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
                }}
                title="Convert this prospect to an active listing. Consumes one monthly slot."
              >
                {promoting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Promote to active listing
              </button>
            )}
          </div>
          {promoteError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">{promoteError}</p>
            </div>
          )}
        </div>

        {/* Tab nav */}
        <div className="border-b border-border -mx-6 sm:mx-0 overflow-x-auto">
          <nav className="flex gap-1 px-6 sm:px-0">
            {TABS.map((tab) => {
              const locked = tab.activeOnly && !isActive;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (locked) return;
                    setActiveTab(tab.id);
                  }}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                    activeTab === tab.id
                      ? "text-foreground"
                      : locked
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground",
                  )}
                  title={
                    locked
                      ? "Promote the listing to active to unlock"
                      : undefined
                  }
                >
                  {locked ? <Lock className="h-3 w-3" /> : tab.icon}
                  {tab.label}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#D4A35C] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab content — slices 3–6 will fill these in. */}
        {activeTab === "overview" && (
          <OverviewTab listing={listing} onListingUpdated={setListing} />
        )}
        {activeTab === "cma" && <CmaTab listing={listing} />}
        {activeTab === "description" && (
          isActive ? (
            <DescriptionTab listing={listing} />
          ) : (
            <UnpromotedPlaceholder />
          )
        )}
        {activeTab === "photos" && (
          isActive ? (
            <PhotosTab listing={listing} />
          ) : (
            <UnpromotedPlaceholder />
          )
        )}
        {activeTab === "html" && (
          isActive ? (
            <HtmlEmailTab listing={listing} />
          ) : (
            <UnpromotedPlaceholder />
          )
        )}

        {isArchived && (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            This listing is archived. Outputs are read-only.
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  listing,
  onListingUpdated,
}: {
  listing: ListingRow;
  onListingUpdated: (next: ListingRow) => void;
}) {
  // Local form state — only PATCHes when "Save" is clicked, so the agent
  // can edit several fields without firing requests per keystroke.
  const [facts, setFacts] = useState<PropertyFacts>(listing.property_facts ?? {});
  const [notes, setNotes] = useState(listing.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    JSON.stringify(facts) !== JSON.stringify(listing.property_facts ?? {}) ||
    notes !== (listing.notes ?? "");

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/apps/listing-studio/listings/${listing.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property_facts: facts,
            notes: notes.trim() ? notes : null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onListingUpdated(data.listing);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const setField = <K extends keyof PropertyFacts>(
    k: K,
    v: PropertyFacts[K],
  ) => setFacts((prev) => ({ ...prev, [k]: v }));

  const numOrNull = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = Number(raw.replace(/[,$]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Property facts
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <FactField label="City">
              <FactInput
                value={facts.city ?? ""}
                onChange={(v) => setField("city", v || null)}
              />
            </FactField>
            <FactField label="State">
              <FactInput
                value={facts.state ?? ""}
                onChange={(v) => setField("state", v || null)}
                maxLength={2}
                className="uppercase"
              />
            </FactField>
            <FactField label="ZIP">
              <FactInput
                value={facts.zip ?? ""}
                onChange={(v) => setField("zip", v || null)}
                inputMode="numeric"
              />
            </FactField>
            <FactField label="Type">
              <select
                value={facts.property_type ?? ""}
                onChange={(e) => setField("property_type", e.target.value || null)}
                className="w-full h-9 px-2 rounded-md border border-border bg-background text-xs"
              >
                <option value="">—</option>
                <option value="single_family">Single Family</option>
                <option value="condo">Condo</option>
                <option value="townhouse">Townhouse</option>
                <option value="multi">Multi-family</option>
                <option value="land">Land</option>
                <option value="other">Other</option>
              </select>
            </FactField>
            <FactField label="Beds">
              <FactInput
                value={facts.beds?.toString() ?? ""}
                onChange={(v) => setField("beds", numOrNull(v))}
                inputMode="numeric"
              />
            </FactField>
            <FactField label="Baths">
              <FactInput
                value={facts.baths?.toString() ?? ""}
                onChange={(v) => setField("baths", numOrNull(v))}
                inputMode="decimal"
              />
            </FactField>
            <FactField label="Living area (sqft)">
              <FactInput
                value={facts.living_area_sqft?.toString() ?? ""}
                onChange={(v) => setField("living_area_sqft", numOrNull(v))}
                inputMode="numeric"
              />
            </FactField>
            <FactField label="Lot (sqft)">
              <FactInput
                value={facts.lot_area_sqft?.toString() ?? ""}
                onChange={(v) => setField("lot_area_sqft", numOrNull(v))}
                inputMode="numeric"
              />
            </FactField>
            <FactField label="Year built">
              <FactInput
                value={facts.year_built?.toString() ?? ""}
                onChange={(v) => setField("year_built", numOrNull(v))}
                inputMode="numeric"
              />
            </FactField>
            <FactField label="Garage">
              <FactInput
                value={facts.garage_spaces?.toString() ?? ""}
                onChange={(v) => setField("garage_spaces", numOrNull(v))}
                inputMode="numeric"
              />
            </FactField>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Private notes about the seller, the property, or the campaign…"
            className="w-full min-h-[200px] px-3 py-2 rounded-md border border-border bg-background text-xs resize-y"
          />
          <p className="text-[11px] text-muted-foreground mt-2">
            Notes are private to you — never shown to the seller or in any
            output.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saveError && (
          <span className="text-xs text-destructive">{saveError}</span>
        )}
        {!saveError && savedAt && !dirty && (
          <span className="text-xs text-muted-foreground">Saved</span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save changes
        </button>
      </div>
    </div>
  );
}

function FactField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function FactInput({
  value,
  onChange,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  inputMode?: "numeric" | "decimal" | "text";
  maxLength?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full h-9 px-2 rounded-md border border-border bg-background text-xs",
        className,
      )}
      {...rest}
    />
  );
}

function StagePill({ stage }: { stage: ListingStage }) {
  const styles: Record<ListingStage, string> = {
    active: "border-[#D4A35C]/50 text-[#D4A35C] bg-[#D4A35C]/10",
    prospect: "border-border text-muted-foreground bg-muted/30",
    archived: "border-border text-muted-foreground bg-muted/30 opacity-70",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-medium capitalize",
        styles[stage],
      )}
    >
      {stage}
    </span>
  );
}

function FactsSummary({ listing }: { listing: ListingRow }) {
  const facts = listing.property_facts ?? {};
  const parts = [
    facts.beds != null ? `${facts.beds} bd` : null,
    facts.baths != null ? `${facts.baths} ba` : null,
    facts.living_area_sqft != null
      ? `${facts.living_area_sqft.toLocaleString()} sqft`
      : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span>· {parts.join(" · ")}</span>;
}

function ComingSoonPlaceholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <Sparkles className="h-7 w-7 mx-auto text-muted-foreground/60 mb-3" />
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Wiring up — coming online with the next build slice. {hint}
      </p>
    </div>
  );
}

function UnpromotedPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <Lock className="h-7 w-7 mx-auto text-muted-foreground/60 mb-3" />
      <p className="text-sm font-medium text-foreground">
        Available after promotion
      </p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Run a CMA, win the listing, then click <b>Promote to active listing</b>{" "}
        at the top to unlock description, photos, and email outputs.
      </p>
    </div>
  );
}
