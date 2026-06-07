"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DragEndEvent } from "@dnd-kit/core";
import { Mic2, ShieldCheck, UserRound, Video } from "lucide-react";
import { TOUR_PROJECT_TYPE_LABELS } from "@/lib/tours/project-types";
import type { TourProjectType } from "@/lib/tours/project-types";
import type { TourProjectWorkspaceViewModel, TourScene } from "@/lib/tours/workspace";
import { PageFrame } from "@/components/app-shell/PagePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  ErrorMessage,
  PhotoStageDropzone,
  ProjectActionsMenu,
  ProjectDetailsDialog,
  ReplacePhotoDialog,
  SceneActionsMenu,
  SceneImageRail,
  SceneStrip,
  SceneUploadDialog,
  type ProjectDetailsForm,
} from "./WorkspacePresentation";
import { SceneDetailsPanel } from "./SceneDetailsPanel";
import { useSourcePhotoSelection } from "./useSourcePhotoSelection";
import { useTourSceneMutations } from "./useTourSceneMutations";

const TOUR_PROJECT_TYPE_ICONS: Record<TourProjectType, typeof Video> = {
  tour_video: Video,
  tour_video_voice_over: Mic2,
  tour_video_avatar: UserRound,
};

async function acknowledgeListingMediaAuthorization(projectId: string) {
  const response = await fetch(
    `/api/apps/tours/projects/${projectId}/listing-media-authorization`,
    { method: "POST" }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not record listing-media authorization.");
  }
  return payload;
}

async function updateTourProjectDetails(projectId: string, details: ProjectDetailsForm) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not update the tour project.");
  }
  return payload;
}

async function archiveTourProject(projectId: string) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/archive`, {
    method: "PATCH",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not delete the tour project.");
  }
  return payload;
}

async function createSceneFact(projectId: string, sceneId: string, text: string) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/facts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not save the scene fact.");
  }
  return payload;
}

async function updateSceneFact(projectId: string, sceneId: string, factId: string, text: string) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/facts/${factId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not update the scene fact.");
  }
  return payload;
}

async function deleteSceneFact(projectId: string, sceneId: string, factId: string) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/facts/${factId}`, {
    method: "DELETE",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not delete the scene fact.");
  }
  return payload;
}

export function TourProjectWorkspace({
  viewModel,
}: {
  viewModel: TourProjectWorkspaceViewModel;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    viewModel.tourScenes[0]?.id ?? null
  );
  const [pendingActiveSceneId, setPendingActiveSceneId] = useState<string | null>(null);

  const [isProjectDetailsOpen, setIsProjectDetailsOpen] = useState(false);
  const [isProjectDeleteOpen, setIsProjectDeleteOpen] = useState(false);
  const [isAddSceneOpen, setIsAddSceneOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<TourScene | null>(null);
  const [sceneToReplacePhoto, setSceneToReplacePhoto] = useState<TourScene | null>(null);
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const [projectDetails, setProjectDetails] = useState<ProjectDetailsForm>({
    name: viewModel.project.name,
    propertyAddress: viewModel.listing.address,
    listingUrl: viewModel.listing.listingUrl ?? "",
  });
  const [sceneTitle, setSceneTitle] = useState("");
  const [scenePhoto, setScenePhoto] = useState<File | null>(null);
  const [scenePhotoPreviewUrl, setScenePhotoPreviewUrl] = useState<string | null>(null);
  const [replacementPhoto, setReplacementPhoto] = useState<File | null>(null);
  const [replacementPhotoPreviewUrl, setReplacementPhotoPreviewUrl] = useState<string | null>(null);

  const authorization = viewModel.listingMediaAuthorization;
  const canUseSceneMediaTools = authorization.hasAcknowledged;
  const TourTypeIcon = TOUR_PROJECT_TYPE_ICONS[viewModel.project.tourType];

  const invalidateWorkspace = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["tours", "workspace", viewModel.project.id],
    });
    router.refresh();
  }, [queryClient, router, viewModel.project.id]);

  const acknowledgementMutation = useMutation({
    mutationFn: () => acknowledgeListingMediaAuthorization(viewModel.project.id),
    onSuccess: invalidateWorkspace,
  });
  const updateProjectMutation = useMutation({
    mutationFn: (details: ProjectDetailsForm) => updateTourProjectDetails(viewModel.project.id, details),
    onSuccess: () => {
      setIsProjectDetailsOpen(false);
      invalidateWorkspace();
    },
  });
  const archiveProjectMutation = useMutation({
    mutationFn: () => archiveTourProject(viewModel.project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tours", "projects", "open"] });
      router.push("/apps/tours/dashboard");
    },
  });
  const sceneFactMutation = useMutation({
    mutationFn: ({ sceneId, text }: { sceneId: string; text: string }) =>
      createSceneFact(viewModel.project.id, sceneId, text),
    onSuccess: (payload, variables) => {
      if (payload?.fact) {
        tourScenes.updateItem(variables.sceneId, (scene) => ({
          ...scene,
          facts: [...scene.facts, payload.fact],
          hasProofedContext: scene.hasProofedContext || payload.fact.proofStatus === "proofed",
        }));
      }
      invalidateWorkspace();
    },
  });
  const updateSceneFactMutation = useMutation({
    mutationFn: ({ sceneId, factId, text }: { sceneId: string; factId: string; text: string }) =>
      updateSceneFact(viewModel.project.id, sceneId, factId, text),
    onSuccess: (payload, variables) => {
      if (payload?.fact) {
        tourScenes.updateItem(variables.sceneId, (scene) => ({
          ...scene,
          facts: scene.facts.map((fact) => (fact.id === variables.factId ? payload.fact : fact)),
          hasProofedContext: scene.facts.some((fact) =>
            fact.id === variables.factId ? payload.fact.proofStatus === "proofed" : fact.proofStatus === "proofed"
          ),
        }));
      }
      invalidateWorkspace();
    },
  });
  const deleteSceneFactMutation = useMutation({
    mutationFn: ({ sceneId, factId }: { sceneId: string; factId: string }) =>
      deleteSceneFact(viewModel.project.id, sceneId, factId),
    onSuccess: (_payload, variables) => {
      tourScenes.updateItem(variables.sceneId, (scene) => {
        const facts = scene.facts.filter((fact) => fact.id !== variables.factId);
        return {
          ...scene,
          facts,
          hasProofedContext: facts.some((fact) => fact.proofStatus === "proofed"),
        };
      });
      invalidateWorkspace();
    },
  });

  const sceneMutations = useTourSceneMutations({
    projectId: viewModel.project.id,
    scenes: viewModel.tourScenes,
    onSceneCreated: (sceneId) => {
      setSceneTitle("");
      setScenePhoto(null);
      setIsAddSceneOpen(false);
      if (sceneId) {
        setPendingActiveSceneId(sceneId);
        setActiveSceneId(sceneId);
      }
    },
    onScenePhotoReplaced: () => {
      setReplacementPhoto(null);
      setSceneToReplacePhoto(null);
    },
    onAddPhotoSettled: () => {
      sourcePhotoSelection.clearPendingScenePhoto();
    },
  });
  const { tourScenes } = sceneMutations;
  const {
    createScene: createSceneMutation,
    replacePhoto: replacePhotoMutation,
    addPhoto: addPhotoMutation,
    removePhoto: removePhotoMutation,
    reorderScenes: reorderScenesMutation,
    toggleSceneInclusion: toggleSceneInclusionMutation,
    deleteScene: deleteSceneMutation,
  } = sceneMutations.mutations;
  const sourcePhotoSelection = useSourcePhotoSelection({
    scenes: tourScenes.items,
    activeSceneId,
  });
  const { activeScene, selectedSourcePhoto, pendingPhotoForActiveScene } = sourcePhotoSelection;
  const sceneCount = tourScenes.items.length;
  const replacingScene = sceneToReplacePhoto
    ? tourScenes.items.find((scene) => scene.id === sceneToReplacePhoto.id) ?? sceneToReplacePhoto
    : null;

  useEffect(() => {
    if (tourScenes.items.length === 0) {
      if (!pendingActiveSceneId) {
        setActiveSceneId(null);
      }
      return;
    }

    if (pendingActiveSceneId) {
      if (tourScenes.items.some((scene) => scene.id === pendingActiveSceneId)) {
        setActiveSceneId(pendingActiveSceneId);
        setPendingActiveSceneId(null);
      }
      return;
    }

    if (!activeSceneId || !tourScenes.items.some((scene) => scene.id === activeSceneId)) {
      setActiveSceneId(tourScenes.items[0].id);
    }
  }, [activeSceneId, pendingActiveSceneId, tourScenes.items]);

  useEffect(() => {
    if (!scenePhoto) {
      setScenePhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(scenePhoto);
    setScenePhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [scenePhoto]);

  useEffect(() => {
    if (!replacementPhoto) {
      setReplacementPhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(replacementPhoto);
    setReplacementPhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [replacementPhoto]);

  function handleProjectDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateProjectMutation.mutate(projectDetails);
  }

  function handleCreateScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("title", sceneTitle);
    if (scenePhoto) {
      formData.set("photo", scenePhoto);
    }
    createSceneMutation.mutate(formData);
  }

  function handleReplaceScenePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sceneToReplacePhoto) {
      return;
    }

    const formData = new FormData();
    if (replacementPhoto) {
      formData.set("photo", replacementPhoto);
    }
    replacePhotoMutation.mutate({ sceneId: sceneToReplacePhoto.id, formData });
  }

  function handleAddScenePhoto(sceneId: string, file: File) {
    const formData = new FormData();
    formData.set("photo", file);
    sourcePhotoSelection.setPendingScenePhoto({ sceneId, file });
    addPhotoMutation.mutate({ sceneId, formData });
  }

  function handleSceneDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    tourScenes.reorderById(active.id, over?.id);
  }

  function confirmSceneDelete() {
    if (!sceneToDelete) {
      return;
    }

    const deletedSceneId = sceneToDelete.id;
    const nextActiveSceneId = tourScenes.items.find((scene) => scene.id !== deletedSceneId)?.id ?? null;

    sceneMutations
      .deleteScene(deletedSceneId)
      .then(() => {
        tourScenes.setItems(tourScenes.items.filter((scene) => scene.id !== deletedSceneId));
        setActiveSceneId(nextActiveSceneId);
        setSceneToDelete(null);
      })
      .catch(() => undefined);
  }

  return (
    <PageFrame className="max-w-none px-4 py-4 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-7xl lg:min-h-[calc(100vh-8rem)]">
        <header className="flex items-start justify-between gap-3">
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
            <p className="mt-1 truncate text-sm text-muted-foreground">{viewModel.listing.address}</p>
          </div>
          <ProjectActionsMenu
            onEdit={() => setIsProjectDetailsOpen(true)}
            onDelete={() => setIsProjectDeleteOpen(true)}
          />
        </header>

        {!canUseSceneMediaTools ? (
          <div className="mt-4 space-y-4 rounded-md border border-border bg-muted/30 p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Authorize listing media</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Scene media tools unlock after this acknowledgement.
                </p>
              </div>
            </div>
            <blockquote className="rounded-md border-l-4 border-primary bg-background px-4 py-3 text-sm text-foreground">
              {authorization.acknowledgementCopy}
            </blockquote>
            {acknowledgementMutation.error && (
              <ErrorMessage>{acknowledgementMutation.error.message}</ErrorMessage>
            )}
            <Button
              type="button"
              className="w-full"
              disabled={acknowledgementMutation.isPending}
              onClick={() => acknowledgementMutation.mutate()}
            >
              {acknowledgementMutation.isPending ? "Recording..." : "I acknowledge"}
            </Button>
          </div>
        ) : (
          <>
            <SceneStrip
              scenes={tourScenes.items}
              itemIds={tourScenes.itemIds}
              activeSceneId={activeSceneId}
              isReordering={tourScenes.isPending || reorderScenesMutation.isPending}
              onSelectScene={setActiveSceneId}
              onAddScene={() => setIsAddSceneOpen(true)}
              onDragEnd={handleSceneDragEnd}
            />

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-3 lg:grid-cols-[88px_minmax(0,1fr)]">
                <SceneImageRail
                  scene={activeScene}
                  selectedPhotoId={selectedSourcePhoto?.id ?? null}
                  isAddingPhoto={addPhotoMutation.isPending}
                  pendingPhotoPreviewUrl={pendingPhotoForActiveScene?.previewUrl ?? null}
                  pendingPhotoName={pendingPhotoForActiveScene?.fileName ?? null}
                  onSelectPhoto={sourcePhotoSelection.setSelectedSourcePhotoId}
                  onAddPhoto={(file) => {
                    if (!activeScene) {
                      return;
                    }
                    handleAddScenePhoto(activeScene.id, file);
                  }}
                />

                <PhotoStageDropzone
                  scene={activeScene}
                  displayPhoto={selectedSourcePhoto}
                  onAddPhoto={(file) => {
                    setScenePhoto(file);
                    setIsAddSceneOpen(true);
                  }}
                  onReplacePhoto={(file) => {
                    if (!activeScene) {
                      return;
                    }
                    setReplacementPhoto(file);
                    setSceneToReplacePhoto(activeScene);
                  }}
                >
                  {activeScene && (
                    <SceneActionsMenu
                      scene={activeScene}
                      selectedPhoto={selectedSourcePhoto}
                      onReplacePhoto={() => {
                        setReplacementPhoto(null);
                        setSceneToReplacePhoto(activeScene);
                      }}
                      onRemovePhoto={() =>
                        removePhotoMutation.mutate({
                          sceneId: activeScene.id,
                          sourcePhotoId: selectedSourcePhoto?.id ?? activeScene.authoritativePhoto.id,
                        })
                      }
                      onRemoveScene={() => setSceneToDelete(activeScene)}
                      isRemovingPhoto={removePhotoMutation.isPending}
                      isRemovingScene={deleteSceneMutation.isPending}
                    />
                  )}
                </PhotoStageDropzone>
              </div>

              <SceneDetailsPanel
                activeScene={activeScene}
                displayPhoto={selectedSourcePhoto}
                sceneIndex={activeScene ? tourScenes.items.findIndex((scene) => scene.id === activeScene.id) : -1}
                isSubmittingFact={sceneFactMutation.isPending}
                isUpdatingFact={updateSceneFactMutation.isPending}
                isDeletingFact={deleteSceneFactMutation.isPending}
                factError={sceneFactMutation.error}
                factActionError={updateSceneFactMutation.error ?? deleteSceneFactMutation.error}
                onAddScene={() => setIsAddSceneOpen(true)}
                onCreateFact={async (text) => {
                  if (!activeScene) {
                    return;
                  }
                  await sceneFactMutation.mutateAsync({ sceneId: activeScene.id, text });
                }}
                onUpdateFact={async (factId, text) => {
                  if (!activeScene) {
                    return;
                  }
                  await updateSceneFactMutation.mutateAsync({ sceneId: activeScene.id, factId, text });
                }}
                onDeleteFact={async (factId) => {
                  if (!activeScene) {
                    return;
                  }
                  await deleteSceneFactMutation.mutateAsync({ sceneId: activeScene.id, factId });
                }}
              />
            </div>

            {(tourScenes.error ??
              reorderScenesMutation.error ??
              toggleSceneInclusionMutation.error ??
              deleteSceneMutation.error ??
              addPhotoMutation.error ??
              removePhotoMutation.error) && (
              <div className="mt-4">
                <ErrorMessage>
                  {(tourScenes.error ??
                    reorderScenesMutation.error ??
                    toggleSceneInclusionMutation.error ??
                    deleteSceneMutation.error ??
                    addPhotoMutation.error ??
                    removePhotoMutation.error)?.message ??
                    "Could not update TourScenes."}
                </ErrorMessage>
              </div>
            )}

            <Button
              type="button"
              className="mt-4 h-14 w-full text-base lg:ml-auto lg:block lg:max-w-sm"
              disabled={sceneCount === 0}
              onClick={() => setWorkflowDialogOpen(true)}
            >
              Approve all and generate
            </Button>
          </>
        )}
      </section>

      <ProjectDetailsDialog
        open={isProjectDetailsOpen}
        details={projectDetails}
        error={updateProjectMutation.error}
        isSaving={updateProjectMutation.isPending}
        onOpenChange={setIsProjectDetailsOpen}
        onChange={setProjectDetails}
        onSubmit={handleProjectDetailsSubmit}
      />
      <SceneUploadDialog
        open={isAddSceneOpen}
        title={sceneTitle}
        photoPreviewUrl={scenePhotoPreviewUrl}
        photoName={scenePhoto?.name ?? null}
        error={createSceneMutation.error}
        isSaving={createSceneMutation.isPending}
        onOpenChange={setIsAddSceneOpen}
        onTitleChange={setSceneTitle}
        onPhotoChange={setScenePhoto}
        onSubmit={handleCreateScene}
      />
      <ReplacePhotoDialog
        open={Boolean(sceneToReplacePhoto)}
        scene={replacingScene}
        photoPreviewUrl={replacementPhotoPreviewUrl}
        photoName={replacementPhoto?.name ?? null}
        error={replacePhotoMutation.error}
        isSaving={replacePhotoMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setReplacementPhoto(null);
            setSceneToReplacePhoto(null);
          }
        }}
        onPhotoChange={setReplacementPhoto}
        onSubmit={handleReplaceScenePhoto}
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
      <ConfirmDialog
        open={Boolean(sceneToDelete)}
        title="Remove scene?"
        body="This permanently removes the scene, its listing photos, and its proofed facts from this Tour Project."
        confirmText="Remove scene"
        pendingText="Removing..."
        error={deleteSceneMutation.error}
        isPending={deleteSceneMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setSceneToDelete(null);
          }
        }}
        onConfirm={confirmSceneDelete}
      />
      <ConfirmDialog
        open={workflowDialogOpen}
        title="Generate tour?"
        body="The approval layout is ready. The generation endpoint is not connected in this workspace yet."
        confirmText="Close"
        error={null}
        isPending={false}
        onOpenChange={setWorkflowDialogOpen}
        onConfirm={() => setWorkflowDialogOpen(false)}
      />
    </PageFrame>
  );
}
