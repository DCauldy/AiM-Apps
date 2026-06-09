import { Skeleton } from "@/components/ui/skeleton";

// Renders inside the Blog Engine layout — only the body swaps to skeleton
// during navigation. Shape mirrors the dashboard since that's the common
// landing destination from the AppSwitcher.
export default function BlogEngineLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Title row + action button */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-4 space-y-2"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>

        {/* Schedule card */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>

        {/* Recent blogs */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-4 space-y-2"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
