"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Building2, Archive, Clock, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ListingRow, ListingStage } from "@/types/listing-studio";

const TABS: { id: ListingStage; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "prospect", label: "Prospects" },
  { id: "archived", label: "Archived" },
];

export function ListingsClient({
  initialListings,
}: {
  initialListings: ListingRow[];
}) {
  const [activeTab, setActiveTab] = useState<ListingStage>(
    initialListings.some((l) => l.stage === "active") ? "active" : "prospect",
  );

  const grouped = useMemo(() => {
    const out: Record<ListingStage, ListingRow[]> = {
      active: [],
      prospect: [],
      archived: [],
    };
    for (const l of initialListings) out[l.stage].push(l);
    return out;
  }, [initialListings]);

  const visible = grouped[activeTab];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-sans text-xl font-bold text-foreground">
              Listings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Prospect CMAs and active listings. Promote a prospect when you
              win the listing agreement.
            </p>
          </div>
          <Link
            href="/apps/listing-studio/listings/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white shadow-lg transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
            }}
          >
            <Plus className="h-4 w-4" />
            New Listing
          </Link>
        </div>

        {/* Tab nav */}
        <div className="border-b border-border -mx-6 sm:mx-0 overflow-x-auto">
          <nav className="flex gap-1 px-6 sm:px-0">
            {TABS.map((tab) => {
              const count = grouped[tab.id].length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                    activeTab === tab.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({count})
                  </span>
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#D4A35C] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {visible.length === 0 ? (
          <EmptyState stage={activeTab} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visible.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListingCard({ listing }: { listing: ListingRow }) {
  const facts = listing.property_facts ?? {};
  const beds = facts.beds ?? null;
  const baths = facts.baths ?? null;
  const sqft = facts.living_area_sqft ?? null;

  return (
    <Link
      href={`/apps/listing-studio/listings/${listing.id}`}
      className="rounded-lg border border-border bg-card p-4 hover:border-[#D4A35C]/40 transition-colors block"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-md text-white shrink-0"
          style={{
            background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
          }}
        >
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {listing.address}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {[
              beds != null ? `${beds} bd` : null,
              baths != null ? `${baths} ba` : null,
              sqft != null ? `${sqft.toLocaleString()} sqft` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Facts not set"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <StagePill stage={listing.stage} />
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {relativeTime(listing.created_at)}
        </span>
      </div>
    </Link>
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
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium capitalize",
        styles[stage],
      )}
    >
      {stage === "archived" && <Archive className="h-2.5 w-2.5" />}
      {stage}
    </span>
  );
}

function EmptyState({ stage }: { stage: ListingStage }) {
  const copy: Record<ListingStage, { title: string; body: string; cta?: string }> = {
    active: {
      title: "No active listings yet",
      body: "Run a CMA for a prospect first, then promote it when you win the listing agreement.",
      cta: "Start a new listing",
    },
    prospect: {
      title: "No prospects",
      body: "Start a CMA for any address — prefilled from public records, with your edits.",
      cta: "Start a new listing",
    },
    archived: {
      title: "Nothing archived",
      body: "Sold or expired listings will show up here.",
    },
  };
  const c = copy[stage];
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <MapPin className="h-7 w-7 mx-auto text-muted-foreground/60 mb-3" />
      <p className="text-sm font-medium text-foreground">{c.title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{c.body}</p>
      {c.cta && (
        <Link
          href="/apps/listing-studio/listings/new"
          className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 text-xs font-medium rounded-md text-white transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {c.cta}
        </Link>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
