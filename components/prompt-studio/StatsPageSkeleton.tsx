import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton } from "./skeletons";

// Mirrors the populated /apps/prompt-studio/stats layout: title +
// description, six stat cards in a 2×3 grid alternating sky/emerald
// variants (matches the real assignments), then the Recent Activity
// panel with a couple of placeholder rows.
export function StatsPageSkeleton() {
  // Same pattern the real page uses: sky / emerald / sky / emerald
  // / sky / emerald — keeps the loaded → real transition silent.
  const variants: Array<"sky" | "emerald"> = [
    "sky",
    "emerald",
    "sky",
    "emerald",
    "sky",
    "emerald",
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-4 w-72" />
        </div>

        {/* Stat-card grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {variants.map((v, i) => (
            <StatCardSkeleton key={i} variant={v} />
          ))}
        </div>

        {/* Recent Activity panel */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border p-4 space-y-2"
              >
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex items-center gap-4 pt-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
