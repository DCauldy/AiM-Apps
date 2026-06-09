import { cn } from "@/lib/utils";

// Lightweight skeleton primitive used by app-level loading.tsx files
// so navigation between apps feels instant. Keep this dumb and CSS-only.
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/60",
        className,
      )}
      {...props}
    />
  );
}
