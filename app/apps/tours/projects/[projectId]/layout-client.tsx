"use client";

import { Mic2, UserRound, Video } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@/components/app-shell/PagePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  ErrorMessage,
  ProjectActionsMenu,
  ProjectDetailsDialog,
} from "@/components/tours/workspace/WorkspacePresentation";
import { TourProjectQaRenderLab } from "@/components/tours/workspace/TourProjectQaRenderLab";
import { useTourRenderRuns } from "@/components/tours/workspace/useTourRenderRuns";
import {
  TourProjectWorkspaceProvider,
  useTourProjectWorkspace,
} from "@/components/tours/workspace/useTourProjectWorkspace";
import { TOUR_PROJECT_TYPE_LABELS, type TourProjectType } from "@/lib/tours/project-types";
import { getTourProjectConfiguration } from "@/lib/tours/project-configuration";
import type { TourProjectWorkspaceViewModel } from "@/lib/tours/workspace";

const TOUR_PROJECT_TYPE_ICONS: Record<TourProjectType, typeof Video> = {
  tour_video: Video,
  tour_video_voice_over: Mic2,
  tour_video_avatar: UserRound,
};

export function TourProjectLayoutClient({
  initialViewModel,
  isQaRenderLabAvailable,
  children,
}: {
  initialViewModel: TourProjectWorkspaceViewModel;
  isQaRenderLabAvailable: boolean;
  children: React.ReactNode;
}) {
  return (
    <TourProjectWorkspaceProvider initialViewModel={initialViewModel}>
      <TourProjectLayoutContent isQaRenderLabAvailable={isQaRenderLabAvailable}>
        {children}
      </TourProjectLayoutContent>
    </TourProjectWorkspaceProvider>
  );
}

function TourProjectLayoutContent({
  isQaRenderLabAvailable,
  children,
}: {
  isQaRenderLabAvailable: boolean;
  children: React.ReactNode;
}) {
  const {
    viewModel,
    projectDetails,
    setProjectDetails,
    isProjectDetailsOpen,
    setIsProjectDetailsOpen,
    isProjectDeleteOpen,
    setIsProjectDeleteOpen,
    updateProjectMutation,
    archiveProjectMutation,
    handleProjectDetailsSubmit,
  } = useTourProjectWorkspace();
  const TourTypeIcon = TOUR_PROJECT_TYPE_ICONS[viewModel.project.tourType];
  const renderRuns = useTourRenderRuns(viewModel.project.id);
  const projectConfiguration = getTourProjectConfiguration(viewModel.project.tourType);
  const isProjectRendering =
    renderRuns.currentRun?.status === "queued" || renderRuns.currentRun?.status === "running";
  const latestDownloadUrl = renderRuns.latestDownloadableRun?.result?.downloadUrl ?? null;
  const renderingHref = `/apps/tours/projects/${viewModel.project.id}/rendering`;

  return (
    <PageFrame className="max-w-none px-4 py-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {viewModel.project.name}
            </h1>
            <Badge
              variant="outline"
              className="shrink-0 gap-1.5 border-primary/50 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
            >
              <TourTypeIcon className="h-3 w-3" />
              {TOUR_PROJECT_TYPE_LABELS[viewModel.project.tourType]}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {viewModel.listing.address}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {isProjectRendering ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={renderingHref}>
                <Video className="h-4 w-4" />
                View progress
              </Link>
            </Button>
          ) : (
            <TourProjectRenderActions
              sceneCount={viewModel.tourScenes.length}
              renderRuns={renderRuns}
            />
          )}
          <ProjectActionsMenu
            latestDownloadUrl={latestDownloadUrl}
            renderingHref={renderingHref}
            downloadTitle={viewModel.project.name}
            canGenerateReuseAssets={
              viewModel.tourScenes.length > 0 &&
              !renderRuns.isCreatingAnyRenderRun &&
              !isProjectRendering
            }
            isGeneratingReuseAssets={renderRuns.isCreatingRenderRun}
            onGenerateReuseAssets={() => {
              if (!isProjectRendering) {
                renderRuns.createRenderRun();
              }
            }}
            onEdit={() => setIsProjectDetailsOpen(true)}
            onDelete={() => setIsProjectDeleteOpen(true)}
          />
        </div>
      </header>

      {renderRuns.error ? (
        <div className="mt-4">
          <ErrorMessage>{renderRuns.error.message}</ErrorMessage>
        </div>
      ) : null}

      {children}

      <ProjectDetailsDialog
        open={isProjectDetailsOpen}
        details={projectDetails}
        tourType={viewModel.project.tourType}
        showVoiceId={projectConfiguration.supportsVoiceSelection}
        showAvatarSettings={projectConfiguration.supportsAvatarSettings}
        error={updateProjectMutation.error}
        isSaving={updateProjectMutation.isPending}
        onOpenChange={setIsProjectDetailsOpen}
        onChange={setProjectDetails}
        onSubmit={handleProjectDetailsSubmit}
      />
      <ConfirmDialog
        open={isProjectDeleteOpen}
        title="Delete project?"
        body="This removes the project from open Tours work by archiving it. Existing records stay available for history."
        confirmText="Delete project"
        error={archiveProjectMutation.error}
        isPending={archiveProjectMutation.isPending}
        onOpenChange={setIsProjectDeleteOpen}
        onConfirm={() => archiveProjectMutation.mutate()}
      />
      <TourProjectQaRenderLab
        isAvailable={isQaRenderLabAvailable}
        isSubmitting={renderRuns.isCreatingPresetRenderRun}
        onSubmitPreset={renderRuns.createPresetRenderRun}
      />
    </PageFrame>
  );
}

function TourProjectRenderActions({
  sceneCount,
  renderRuns,
}: {
  sceneCount: number;
  renderRuns: ReturnType<typeof useTourRenderRuns>;
}) {
  const isProjectRendering =
    renderRuns.currentRun?.status === "queued" || renderRuns.currentRun?.status === "running";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={sceneCount === 0 || renderRuns.isCreatingAnyRenderRun || isProjectRendering}
        onClick={() => {
          if (!isProjectRendering) {
            renderRuns.createFreshRenderRun();
          }
        }}
      >
        <Video className="h-4 w-4" />
        {renderRuns.isCreatingFreshRenderRun ? "Starting video..." : "Generate video"}
      </Button>
    </>
  );
}
