import { DashboardCard, PageFrame } from "@/components/app-shell/PagePrimitives";

export default function ToursLoading() {
  return (
    <PageFrame>
      <div>
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-full max-w-md animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <DashboardCard>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-5 space-y-4">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
          </div>
        </DashboardCard>
        <DashboardCard>
          <div className="h-5 w-36 animate-pulse rounded bg-muted" />
          <div className="mt-4 space-y-3">
            <div className="h-12 animate-pulse rounded bg-muted" />
            <div className="h-12 animate-pulse rounded bg-muted" />
          </div>
        </DashboardCard>
      </div>
    </PageFrame>
  );
}
