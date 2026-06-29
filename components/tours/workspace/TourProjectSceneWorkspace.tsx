"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { SceneDetailsPanel } from "./SceneDetailsPanel";
import { SceneStrip, useSceneStripDragEnd } from "./SceneStripDrag";
import { useTourProjectScenesWorkspace } from "./useTourProjectScenesWorkspace";
import { useTourProjectWorkspace } from "./useTourProjectWorkspace";
import { ErrorMessage, SceneImageRail, PhotoStageDropzone, SceneActionsMenu, SceneUploadDialog, ReplacePhotoDialog, ConfirmDialog } from "./WorkspacePresentation";

export function TourProjectSceneWorkspace({
  initialSceneId,
}: {
  initialSceneId?: string | null;
}) {
  const router = useRouter();
  const { viewModel, acknowledgementMutation } = useTourProjectWorkspace();

  const authorization = viewModel.listingMediaAuthorization;
  const canUseSceneMediaTools = authorization.hasAcknowledged;
  const handleActiveSceneIdChange = useCallback(
    (sceneId: string | null) => {
      const projectPath = `/apps/tours/projects/${viewModel.project.id}`;
      router.push(sceneId ? `${projectPath}/${sceneId}` : projectPath);
    },
    [router, viewModel.project.id]
  );

  const {
    activeSceneId,
    setActiveSceneId,
    isAddSceneOpen,
    setIsAddSceneOpen,
    sceneToDelete,
    setSceneToDelete,
    sceneToReplacePhoto,
    setSceneToReplacePhoto,
    sceneTitle,
    setSceneTitle,
    scenePhoto,
    setScenePhoto,
    scenePhotoPreviewUrl,
    replacementPhoto,
    setReplacementPhoto,
    replacementPhotoPreviewUrl,
    tourScenes,
    sourcePhotoSelection,
    activeScene,
    selectedSourcePhoto,
    pendingPhotoForActiveScene,
    replacingScene,
    sceneFactMutation,
    updateSceneFactMutation,
    deleteSceneFactMutation,
    createSceneMutation,
    replacePhotoMutation,
    addPhotoMutation,
    removePhotoMutation,
    reorderScenesMutation,
    toggleSceneInclusionMutation,
    updateSceneCameraMotionMutation,
    updateSceneTransitionEffectMutation,
    deleteSceneMutation,
    updateCameraMotion,
    updateTransitionEffect,
    handleCreateScene,
    handleReplaceScenePhoto,
    handleAddScenePhoto,
    confirmSceneDelete,
  } = useTourProjectScenesWorkspace({
    viewModel,
    initialSceneId,
    onActiveSceneIdChange: handleActiveSceneIdChange,
  });
  const handleSceneDragEnd = useSceneStripDragEnd({ reorderById: tourScenes.reorderById });

  return (
    <>
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
            <div className="mt-5 flex items-start gap-2">
              <Button
                asChild
                type="button"
                variant="outline"
                size="icon"
                className="h-16 w-16 flex-none"
              >
                <Link
                  href={`/apps/tours/projects/${viewModel.project.id}`}
                  aria-label="Back to project scenes"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="ml-auto min-w-0 max-w-full lg:max-w-[calc(100%-5rem)]">
                <SceneStrip
                  scenes={tourScenes.items}
                  itemIds={tourScenes.itemIds}
                  activeSceneId={activeSceneId}
                  isReordering={tourScenes.isPending || reorderScenesMutation.isPending}
                  onSelectScene={setActiveSceneId}
                  onAddScene={() => setIsAddSceneOpen(true)}
                  onDragEnd={handleSceneDragEnd}
                />
              </div>
            </div>

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
                isUpdatingCameraMotion={updateSceneCameraMotionMutation.isPending}
                isUpdatingTransitionEffect={updateSceneTransitionEffectMutation.isPending}
                factError={sceneFactMutation.error}
                factActionError={updateSceneFactMutation.error ?? deleteSceneFactMutation.error}
                cameraMotionError={updateSceneCameraMotionMutation.error}
                transitionEffectError={updateSceneTransitionEffectMutation.error}
                onAddScene={() => setIsAddSceneOpen(true)}
                onCameraMotionChange={async (cameraMotion) => {
                  if (!activeScene) {
                    return;
                  }
                  await updateCameraMotion(activeScene.id, cameraMotion);
                }}
                onTransitionEffectChange={async (transitionEffect) => {
                  if (!activeScene) {
                    return;
                  }
                  await updateTransitionEffect(activeScene.id, transitionEffect);
                }}
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
              updateSceneCameraMotionMutation.error ??
              updateSceneTransitionEffectMutation.error ??
              deleteSceneMutation.error ??
              addPhotoMutation.error ??
              removePhotoMutation.error) && (
              <div className="mt-4">
                <ErrorMessage>
                  {(tourScenes.error ??
                    reorderScenesMutation.error ??
                    toggleSceneInclusionMutation.error ??
                    updateSceneCameraMotionMutation.error ??
                    updateSceneTransitionEffectMutation.error ??
                    deleteSceneMutation.error ??
                    addPhotoMutation.error ??
                    removePhotoMutation.error)?.message ??
                    "Could not update TourScenes."}
                </ErrorMessage>
              </div>
            )}
          </>
        )}
      
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
    </>
  );
}
