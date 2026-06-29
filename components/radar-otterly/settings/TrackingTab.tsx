"use client";

import { Database } from "lucide-react";

import type { OtterlyBrandReport } from "@/lib/radar-otterly/types";
import type { SettingsCapacity } from "./types";
import { CustomizeSection } from "./CustomizeSection";

// Read-only "what we're tracking" view + the Customize section
// (customer self-service add prompt / add competitor forms).

export function TrackingTab({
  report,
  websiteUrl,
  capacity,
  trackedPrompts,
}: {
  report: OtterlyBrandReport;
  websiteUrl: string;
  capacity: SettingsCapacity | null;
  trackedPrompts: Array<{ id: string; prompt: string }>;
}) {
  const competitorList = report.competitors
    .map((c) => c.brand)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-400" />
            What we&apos;re tracking
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Read-only. Need changes? Ping AiM support and we&apos;ll update
            your tracking config.
          </p>
        </header>
        <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-y-3 gap-x-4 p-5 text-sm">
          <Row label="Brand" value={report.brand} />
          <Row label="Brand domain" value={report.brandDomain} />
          <Row label="Profile website" value={websiteUrl} />
          <Row
            label="Domain variations"
            value={
              report.brandDomainVariations.length > 0
                ? report.brandDomainVariations.join(", ")
                : "—"
            }
          />
          <Row
            label="Countries"
            value={report.countries.map((c) => c.toUpperCase()).join(", ")}
          />
          <Row
            label="Competitors tracked"
            value={
              report.competitors.length > 0
                ? `${report.competitors.length} · ${competitorList}`
                : "None"
            }
          />
          <Row
            label="Created"
            value={new Date(report.createdDate).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          />
        </dl>
      </section>

      <CustomizeSection
        capacity={capacity}
        trackedPrompts={trackedPrompts}
        competitors={report.competitors.map((c) => ({
          brand: c.brand,
          domain: c.brandDomain,
        }))}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-foreground break-words">{value}</dd>
    </>
  );
}
