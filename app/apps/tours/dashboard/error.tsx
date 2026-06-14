"use client";

import { DashboardCard, PageFrame } from "@/components/app-shell/PagePrimitives";
import { Button } from "@/components/ui/button";

export default function ToursDashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageFrame>
      <DashboardCard className="mx-auto max-w-2xl text-center">
        <h1 className="text-xl font-semibold text-foreground">
          We could not load the Tours dashboard
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Try again to reload your tour project workspace shell.
        </p>
        <Button
          type="button"
          onClick={reset}
          className="mt-6"
        >
          Retry
        </Button>
      </DashboardCard>
    </PageFrame>
  );
}
