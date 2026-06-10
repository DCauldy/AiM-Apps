"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  DollarSign,
  FileText,
  Camera,
  Mail,
  Send,
  Sparkles,
  Loader2,
  Lock,
  AlertCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { DescriptionTab } from "@/components/listing-studio/description/DescriptionTab";
import { CmaTab } from "@/components/listing-studio/cma/CmaTab";
import { PhotosTab } from "@/components/listing-studio/photos/PhotosTab";
import { DotwTab } from "@/components/listing-studio/emails/DotwTab";
import { HtmlEmailTab } from "@/components/listing-studio/emails/HtmlEmailTab";
import type { ListingRow, ListingStage } from "@/types/listing-studio";

type Tab = "overview" | "cma" | "description" | "photos" | "dotw" | "html";

// Tabs are split into two groups:
//   - "prospect" tabs available before promotion (Overview, CMA)
//   - "active" tabs unlocked once the listing is promoted
const TABS: { id: Tab; label: string; icon: React.ReactNode; activeOnly?: boolean }[] = [
  { id: "overview", label: "Overview", icon: <Building2 className="h-3.5 w-3.5" /> },
  { id: "cma", label: "CMA", icon: <DollarSign className="h-3.5 w-3.5" /> },
  { id: "description", label: "Description", icon: <FileText className="h-3.5 w-3.5" />, activeOnly: true },
  { id: "photos", label: "Photos", icon: <Camera className="h-3.5 w-3.5" />, activeOnly: true },
  { id: "dotw", label: "DOTW Email", icon: <Send className="h-3.5 w-3.5" />, activeOnly: true },
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
        {activeTab === "overview" && <OverviewTab listing={listing} />}
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
        {activeTab === "dotw" && (
          isActive ? (
            <DotwTab listing={listing} />
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

function OverviewTab({ listing }: { listing: ListingRow }) {
  const facts = listing.property_facts ?? {};
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Property facts</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-xs">
          <Row label="Address" value={listing.address} />
          <Row label="City" value={facts.city ?? "—"} />
          <Row label="State / ZIP" value={`${facts.state ?? "—"} ${facts.zip ?? ""}`.trim()} />
          <Row label="Type" value={facts.property_type ?? "—"} />
          <Row label="Beds / Baths" value={`${facts.beds ?? "—"} / ${facts.baths ?? "—"}`} />
          <Row label="Living area" value={facts.living_area_sqft ? `${facts.living_area_sqft.toLocaleString()} sqft` : "—"} />
          <Row label="Lot" value={facts.lot_area_sqft ? `${facts.lot_area_sqft.toLocaleString()} sqft` : "—"} />
          <Row label="Year built" value={facts.year_built ?? "—"} />
          <Row label="Garage" value={facts.garage_spaces ?? "—"} />
          <Row
            label="Last sale"
            value={
              facts.last_sale_price_cents
                ? `$${(facts.last_sale_price_cents / 100).toLocaleString()}${facts.last_sale_date ? ` · ${facts.last_sale_date}` : ""}`
                : "—"
            }
          />
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Notes</h2>
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
          {listing.notes || "No notes yet. Add private notes about the seller, the property, or the campaign here."}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground text-right">{value}</dd>
    </>
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
