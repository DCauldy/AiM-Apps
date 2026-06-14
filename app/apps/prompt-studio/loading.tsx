import { Skeleton } from "@/components/ui/skeleton";

// Renders during navigation into any Prompt Studio route. Shape is the
// chat window since /apps/prompt-studio redirects to /chat by default.
export default function PromptStudioLoading() {
  return (
    <div className="h-full flex flex-col">
      {/* Chat input area + recent threads stub */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="space-y-2 text-center">
            <Skeleton className="h-7 w-64 mx-auto" />
            <Skeleton className="h-4 w-80 mx-auto" />
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-24 w-full" />
            <div className="flex justify-end">
              <Skeleton className="h-9 w-24" />
            </div>
          </div>

          {/* Recent threads */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
