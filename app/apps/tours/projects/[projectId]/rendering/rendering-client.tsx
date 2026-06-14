"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/tours/workspace/WorkspacePresentation";
import { TourRenderStatusPanel } from "@/components/tours/workspace/TourRenderStatusPanel";
import { useTourRenderRuns } from "@/components/tours/workspace/useTourRenderRuns";
import { isTourRenderRunActive } from "@/lib/tours/rendering/tour-render.contract";

export function TourProjectRenderingClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const renderRuns = useTourRenderRuns(projectId);
  const projectHref = `/apps/tours/projects/${projectId}`;
  const activeRun =
    renderRuns.currentRun && isTourRenderRunActive(renderRuns.currentRun)
      ? renderRuns.currentRun
      : null;

  useEffect(() => {
    if (!renderRuns.isLoadingRecentRuns && !activeRun) {
      router.replace(projectHref);
    }
  }, [activeRun, projectHref, renderRuns.isLoadingRecentRuns, router]);

  if (renderRuns.isLoadingRecentRuns) {
    return (
      <section className="mt-5 flex min-h-[calc(100vh-14rem)] items-center justify-center text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Loading render status...
      </section>
    );
  }

  if (!activeRun) {
    return null;
  }

  return (
    <div className="mt-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={projectHref}>
          <ArrowLeft className="h-4 w-4" />
          Back to workspace
        </Link>
      </Button>

      {renderRuns.error ? (
        <div className="mt-4">
          <ErrorMessage>{renderRuns.error.message}</ErrorMessage>
        </div>
      ) : null}

      <TourRenderStatusPanel run={activeRun} />
    </div>
  );
}
