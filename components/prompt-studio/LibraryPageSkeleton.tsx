import { Skeleton } from "@/components/ui/skeleton";
import { PromptCardGridSkeleton } from "./skeletons";

// Library-style page skeleton: title block + search + sort/filter
// row + (optional) submit button + 3×3 card grid. Used by
// Community Prompts, AiM Library, and Bookmarked — those three
// pages share a near-identical chrome shape, just different titles
// and toolbar buttons.
export function LibraryPageSkeleton({
  showSubmitButton = false,
}: {
  showSubmitButton?: boolean;
}) {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        {/* Title + description */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-8 w-56" />
          </div>
          <Skeleton className="h-4 w-80" />
        </div>

        {/* Search input */}
        <Skeleton className="h-10 w-full mb-4 rounded-md" />

        {/* Sort + filter row */}
        <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
          <div className="flex gap-2 items-center">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
          {showSubmitButton && (
            <Skeleton className="h-9 w-36 rounded-md" />
          )}
        </div>

        {/* Card grid */}
        <PromptCardGridSkeleton count={9} />
      </div>
    </div>
  );
}
