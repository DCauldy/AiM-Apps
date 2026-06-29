import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the populated dashboard layout in DashboardClient — header
// strip, 6 KPI tiles, competitor table card, two leaderboard cards,
// recommendations strip. Loading.tsx and DashboardClient's pending
// state both render this so the transition is silent.
export function RadarOtterlyDashboardSkeleton() {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header: brand name + meta */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-7 w-32" />
        </div>

        {/* KPI strip — 6 tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-4 space-y-2"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* You vs competitors */}
            <PanelSkeleton rows={3} />
            {/* Detected brand landscape */}
            <PanelSkeleton rows={6} />
          </div>
          <div className="space-y-5">
            {/* Top cited sources */}
            <PanelSkeleton rows={8} />
            {/* Recommendations */}
            <PanelSkeleton rows={3} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-3 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <li
            key={i}
            className="px-5 py-3 flex items-center justify-between gap-3"
          >
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-16" />
          </li>
        ))}
      </ul>
    </div>
  );
}
