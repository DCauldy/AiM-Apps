import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ============================================================
// Prompt Studio skeleton primitives — shared between route-level
// loading.tsx (first paint during navigation) and the in-component
// loading branches (during client-side fetch). Each mirrors the
// real component's shape so the visual transition from skeleton →
// loaded is silent.
// ============================================================

/** Mirrors PromptCard: title + author/date line + 160px content
 *  preview + footer actions. Used by Community Prompts / AiM Library
 *  / Bookmarked. */
export function PromptCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card flex flex-col h-full overflow-hidden">
      <div className="p-5 space-y-3 flex-1 flex flex-col">
        {/* Title + actions */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2 min-h-[5.25rem]">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Skeleton className="h-8 w-12 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
        {/* Description */}
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="px-5 pb-5 space-y-3">
        {/* Author + date row */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        {/* Content preview box (matches the 160px h-40 fixture in PromptCard) */}
        <Skeleton className="h-40 w-full rounded-lg" />
        {/* View / copy buttons row */}
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors a stats stat-card: small label + icon, big value, sub
 *  description. Used by /stats. The card border accent fills with
 *  the theme tokens since the real card uses tinted accents. */
export function StatCardSkeleton({
  variant = "sky",
}: {
  variant?: "sky" | "emerald";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3",
        variant === "sky"
          ? "border-sky-500/30 bg-sky-500/5"
          : "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}

/** Mirrors a chat message bubble. Variants:
 *  - `user`: right-aligned, narrower (max-w-md)
 *  - `assistant`: full-width, more rows (longer responses)
 *  Use a mix to draw a believable scrollback. */
export function ChatMessageSkeleton({
  role = "assistant",
}: {
  role?: "user" | "assistant";
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-md space-y-2 bg-card border border-border rounded-2xl rounded-br-md px-4 py-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2 max-w-3xl">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/** Grid of PromptCardSkeletons for the library-style pages. The
 *  toolbar shape varies by page so each library skeleton wraps this
 *  with its own header. */
export function PromptCardGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <PromptCardSkeleton key={i} />
      ))}
    </div>
  );
}
