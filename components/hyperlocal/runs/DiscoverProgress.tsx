"use client";

import { Database, Loader2, Users } from "lucide-react";
import type { HlRun } from "@/types/hyperlocal";

// ============================================================
// Live progress for the Discover phase.
//
// The page already polls /runs/[id] every 3s while in this phase
// (see run-client.tsx). We just need to render the moving target
// instead of a static "please wait." Three states based on
// contacts_fetched:
//
//   0      → "Connecting to your CRM…"
//   1-99   → "Found N contacts so far…"
//   100+   → big animated count + "Found N contacts so far…"
//
// Keeps the agent engaged during a 10–60s wait that previously
// felt much longer because nothing on screen moved.
// ============================================================

export function DiscoverProgress({ run }: { run: HlRun }) {
  const count = run.contacts_fetched ?? 0;
  return (
    <div className="rounded-lg border border-border bg-card p-6 sm:p-8 text-center flex flex-col justify-center gap-4 h-full min-h-[460px]">
      <div className="flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <p className="text-sm font-semibold text-foreground">
          Discovering contacts from your CRM
        </p>
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center gap-2">
          <Database className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Connecting and reading your contact records…
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-4xl sm:text-5xl font-bold tabular-nums text-foreground">
            {count.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            contacts found so far · still streaming
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70 pt-2">
        Usually 10–60 seconds depending on contact count. Larger CRMs (10K+)
        can take a couple of minutes.
      </p>
    </div>
  );
}
