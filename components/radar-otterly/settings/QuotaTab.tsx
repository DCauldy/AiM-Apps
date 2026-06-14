"use client";

import { cn } from "@/lib/utils";
import { RADAR_INCLUDED_TIER } from "@/lib/radar-packs";

// Shows the customer's personal allocation from their current plan
// tier — NOT the Otterly account-level numbers (which are shared
// across every AiM customer and confusing in context).
//
// Hardcoded to RADAR_INCLUDED_TIER until per-customer subscription
// schema exists. When that lands, look up the user's pack and use
// it here instead.

export function QuotaTab() {
  const tier = RADAR_INCLUDED_TIER;
  const refreshLabel =
    tier.refreshFrequency === "weekly" ? "Weekly refresh" : "Daily refresh";

  const allocations: Array<{ label: string; value: string }> = [
    { label: "Tracked prompts", value: tier.prompts.toLocaleString() },
    { label: "Competitors", value: tier.competitors.toLocaleString() },
    {
      label: "URL audits / month",
      value: tier.auditsPerMonth.toLocaleString(),
    },
    { label: "Refresh cadence", value: refreshLabel },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="border-b border-border px-5 py-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Your allocation</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              What&apos;s included with your{" "}
              <span className="font-medium text-foreground">{tier.tier}</span>{" "}
              plan.
            </p>
          </div>
        </header>
        <ul className={cn("divide-y divide-border")}>
          {allocations.map((a) => (
            <li
              key={a.label}
              className="px-5 py-3 flex items-center justify-between gap-3"
            >
              <span className="text-sm">{a.label}</span>
              <span className="text-sm font-medium tabular-nums text-foreground">
                {a.value}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[11px] text-muted-foreground text-center">
        Want more? Head to the Upgrade tab for Bronze / Silver / Gold / Diamond
        packs.
      </p>
    </div>
  );
}
