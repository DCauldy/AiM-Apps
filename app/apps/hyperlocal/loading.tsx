import { Skeleton } from "@/components/ui/skeleton";

// Renders inside <HyperlocalLayoutClient> — the header stays mounted,
// only this body skeleton swaps in until the page's server fetch resolves.
// Shape mirrors the dashboard since that's the most common destination
// from the AppSwitcher.
export default function HyperlocalLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Status pill row */}
        <Skeleton className="h-9 w-full max-w-2xl" />

        {/* Hero card */}
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex flex-wrap gap-3 pt-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
