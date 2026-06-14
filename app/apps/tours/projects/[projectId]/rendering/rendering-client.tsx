"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/tours/workspace/WorkspacePresentation";
import { TourRenderStatusPanel } from "@/components/tours/workspace/TourRenderStatusPanel";
import { useTourProjectWorkspace } from "@/components/tours/workspace/useTourProjectWorkspace";
import { useTourRenderRuns } from "@/components/tours/workspace/useTourRenderRuns";
import { isTourRenderRunActive } from "@/lib/tours/rendering/tour-render.contract";

export function TourProjectRenderingClient({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const { viewModel } = useTourProjectWorkspace();
  const renderRuns = useTourRenderRuns(projectId);
  const projectHref = `/apps/tours/projects/${projectId}`;

  if (renderRuns.isLoadingRecentRuns) {
    return (
      <section className="mt-5 flex min-h-[calc(100vh-14rem)] items-center justify-center text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Loading render status...
      </section>
    );
  }

  return (
    <div className="mt-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={projectHref}>
          <ArrowLeft className="h-4 w-4" />
          Back to workspace
        </Link>
      </Button>
      {!renderRuns.recentRuns.length && !renderRuns.currentRun ? (
        <NoRuns renderRuns={renderRuns} />
      ) : null}
      {renderRuns.error ? (
        <div className="mt-4">
          <ErrorMessage>{renderRuns.error.message}</ErrorMessage>
        </div>
      ) : null}

      {renderRuns.currentRun ? (
        <TourRenderStatusPanel
          run={renderRuns.currentRun}
          downloadTitle={viewModel.project.name}
        />
      ) : null}
    </div>
  );
}

function NoRuns({
  renderRuns,
}: {
  renderRuns: ReturnType<typeof useTourRenderRuns>;
}) {
  return (
    <div className="mt-5 bg-card rounded text-white">
      <p>You have not yet rendered any tour presentations for this project.</p>
      <Button onClick={renderRuns.createRenderRun}>Generate Video</Button>
    </div>
  );
}
