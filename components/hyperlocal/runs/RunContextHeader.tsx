"use client";

import { MapPin, Tag, DollarSign, Home, Eye } from "lucide-react";

// ============================================================
// Compact chip strip shown at the top of every run phase. Reminds
// the agent what the run is actually targeting so they don't have
// to remember decisions made several minutes ago.
//
// Chips render only when their data exists — a vanilla "all
// property types, balanced lens, no price filter" campaign shows
// just the name + segmentation + service area.
// ============================================================

export interface RunContext {
  campaign?: {
    name?: string;
    segmentation?: string;
    property_type_filters?: string[];
    price_range_low?: number | null;
    price_range_high?: number | null;
    lens?: string;
    service_area_zips?: string[];
  } | null;
  contactsCount: number;
  contactsLabel: string;
}

export function RunContextHeader({ context }: { context: RunContext }) {
  const c = context.campaign;
  const chips: ChipProps[] = [];

  if (c?.name) {
    chips.push({ icon: <Tag className="h-3 w-3" />, label: c.name, accent: true });
  }

  if (c?.service_area_zips && c.service_area_zips.length > 0) {
    chips.push({
      icon: <MapPin className="h-3 w-3" />,
      label: `${c.service_area_zips.length} ZIP${c.service_area_zips.length === 1 ? "" : "s"}`,
    });
  } else if (c?.segmentation && c.segmentation !== "zip") {
    chips.push({
      icon: <MapPin className="h-3 w-3" />,
      label: `By ${c.segmentation}`,
    });
  }

  // Combine contact count into a single chip; we already render it in
  // the page sub-header, but putting it in the chip strip too gives
  // a single visual scan-line for the agent.
  if (context.contactsCount > 0) {
    chips.push({
      label: `${context.contactsCount.toLocaleString()} ${context.contactsLabel}`,
    });
  }

  if (c?.property_type_filters && c.property_type_filters.length > 0) {
    chips.push({
      icon: <Home className="h-3 w-3" />,
      label: c.property_type_filters.join(" · "),
    });
  }

  if (c?.price_range_low || c?.price_range_high) {
    chips.push({
      icon: <DollarSign className="h-3 w-3" />,
      label: formatPriceRange(c.price_range_low, c.price_range_high),
    });
  }

  if (c?.lens && c.lens !== "balanced") {
    chips.push({
      icon: <Eye className="h-3 w-3" />,
      label: c.lens === "seller" ? "Seller-leaning" : "Buyer-leaning",
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map((chip, i) => (
        <Chip key={i} {...chip} />
      ))}
    </div>
  );
}

interface ChipProps {
  icon?: React.ReactNode;
  label: string;
  /** Primary tint for the lead chip (usually the campaign name). */
  accent?: boolean;
}

function Chip({ icon, label, accent }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
        accent
          ? "bg-primary/10 text-primary border-primary/30"
          : "bg-muted/40 text-muted-foreground border-border"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}

function formatPriceRange(low?: number | null, high?: number | null): string {
  const fmt = (n?: number | null) =>
    !n
      ? null
      : n >= 1_000_000
        ? `$${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000
          ? `$${Math.round(n / 1000)}K`
          : `$${n}`;
  const lo = fmt(low);
  const hi = fmt(high);
  if (lo && hi) return `${lo}–${hi}`;
  if (lo) return `${lo}+`;
  if (hi) return `Under ${hi}`;
  return "Any price";
}
