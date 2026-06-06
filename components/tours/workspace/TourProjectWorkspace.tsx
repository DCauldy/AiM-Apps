"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, ImagePlus, ShieldCheck } from "lucide-react";
import type { TourProjectWorkspaceViewModel, TourScene } from "@/lib/tours/workspace";
import {
  InlineStatusBanner,
  PageFrame,
  PageHeader,
} from "@/components/app-shell/PagePrimitives";
import { Button } from "@/components/ui/button";
import { useOptimisticSortableList } from "@/hooks/useOptimisticSortableList";

const READINESS_LABELS: Record<keyof TourProjectWorkspaceViewModel["readiness"], string> = {
  media: "Media",
  scenePlan: "TourScene plan",
  approvals: "Approvals",
  narration: "Narration",
  export: "Export",
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

async function createSceneFromListingPhoto(projectId: string, formData: FormData) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not create the TourScene.");
  }
  return payload;
}

async function reorderTourScenes(projectId: string, orderedSceneIds: string[]) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedSceneIds }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not save the TourScene order.");
  }
  return payload;
}

async function toggleSceneInclusion(projectId: string, sceneId: string, included: boolean) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/inclusion`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ included }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not update TourScene inclusion.");
  }
  return payload;
}

function SortableSceneCard({
  scene,
  index,
  totalScenes,
  isReordering,
  onMove,
  onToggleInclusion,
}: {
  scene: TourScene;
  index: number;
  totalScenes: number;
  isReordering: boolean;
  onMove: (sceneId: string, direction: "up" | "down") => void;
  onToggleInclusion: (sceneId: string, included: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
    disabled: isReordering,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`space-y-2 bg-background p-4 ${isDragging ? "relative z-10 shadow-lg" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <button
            type="button"
            className="mt-0.5 cursor-grab rounded-md border border-border p-1 text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Drag to reorder ${scene.title}`}
            disabled={isReordering}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{scene.title}</h3>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Scene {index + 1} · {scene.cameraMotion.replace("_", " ")}
            </p>
          </div>
        </div>
        <span className={scene.included ? "rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary" : "rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"}>
          {scene.included ? "Included" : "Skipped"}
        </span>
      </div>
      {scene.authoritativePhoto.previewUrl && (
        <img
          src={scene.authoritativePhoto.previewUrl}
          alt={`Authoritative listing photo for ${scene.title}`}
          className="h-32 w-full rounded-md border border-border object-cover"
        />
      )}
      <p className="text-sm text-muted-foreground">
        Authoritative photo: {scene.authoritativePhoto.fileName}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={index === 0 || isReordering}
          onClick={() => onMove(scene.id, "up")}
        >
          <ArrowUp className="h-4 w-4" />
          Move up
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={index === totalScenes - 1 || isReordering}
          onClick={() => onMove(scene.id, "down")}
        >
          <ArrowDown className="h-4 w-4" />
          Move down
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isReordering}
          onClick={() => onToggleInclusion(scene.id, !scene.included)}
        >
          {scene.included ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {scene.included ? "Exclude" : "Re-include"}
        </Button>
      </div>
    </div>
  );
}

export function TourProjectWorkspace({
  viewModel,
}: {
  viewModel: TourProjectWorkspaceViewModel;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sceneTitle, setSceneTitle] = useState("");
  const [scenePhoto, setScenePhoto] = useState<File | null>(null);
  const [scenePhotoPreviewUrl, setScenePhotoPreviewUrl] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const acknowledgementMutation = useMutation({
    mutationFn: () => acknowledgeListingMediaAuthorization(viewModel.project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tours", "workspace", viewModel.project.id],
      });
      router.refresh();
    },
  });
  const createSceneMutation = useMutation({
    mutationFn: (formData: FormData) => createSceneFromListingPhoto(viewModel.project.id, formData),
    onSuccess: () => {
      setSceneTitle("");
      setScenePhoto(null);
      queryClient.invalidateQueries({
        queryKey: ["tours", "workspace", viewModel.project.id],
      });
      router.refresh();
    },
  });
  const reorderScenesMutation = useMutation({
    mutationFn: (orderedSceneIds: string[]) => reorderTourScenes(viewModel.project.id, orderedSceneIds),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tours", "workspace", viewModel.project.id],
      });
      router.refresh();
    },
  });
  const persistSceneOrder = useCallback(
    (orderedSceneIds: string[]) => reorderScenesMutation.mutateAsync(orderedSceneIds),
    [reorderScenesMutation.mutateAsync]
  );
  const tourScenes = useOptimisticSortableList({
    items: viewModel.tourScenes,
    getId: useCallback((scene: TourScene) => scene.id, []),
    getSyncKey: useCallback(
      (scene: TourScene) =>
        `${scene.title}\u001e${scene.sortOrder}\u001e${scene.included}\u001e${scene.cameraMotion}\u001e${scene.authoritativePhoto.previewUrl ?? ""}`,
      []
    ),
    isLocked: reorderScenesMutation.isPending,
    onPersistOrder: persistSceneOrder,
  });
  const toggleSceneInclusionMutation = useMutation({
    mutationFn: ({ sceneId, included }: { sceneId: string; included: boolean }) =>
      toggleSceneInclusion(viewModel.project.id, sceneId, included),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tours", "workspace", viewModel.project.id],
      });
      router.refresh();
    },
  });
  const authorization = viewModel.listingMediaAuthorization;
  const canUseSceneMediaTools = authorization.hasAcknowledged;

  useEffect(() => {
    if (!scenePhoto) {
      setScenePhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(scenePhoto);
    setScenePhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [scenePhoto]);

  function handleCreateScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("title", sceneTitle);
    if (scenePhoto) {
      formData.set("photo", scenePhoto);
    }
    createSceneMutation.mutate(formData);
  }

  function moveScene(sceneId: string, direction: "up" | "down") {
    tourScenes.moveItem(sceneId, direction);
  }

  function handleSceneDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    tourScenes.reorderById(active.id, over?.id);
  }

  async function handleToggleSceneInclusion(sceneId: string, included: boolean) {
    const previousScene = tourScenes.items.find((scene) => scene.id === sceneId);
    tourScenes.updateItem(sceneId, (scene) => ({
      ...scene,
      included,
      status: included ? "ready" : "skipped",
    }));

    try {
      await toggleSceneInclusionMutation.mutateAsync({ sceneId, included });
    } catch {
      if (previousScene) {
        tourScenes.updateItem(sceneId, () => previousScene);
      }
    }
  }

  return (
    <PageFrame>
      <PageHeader
        title={viewModel.project.name}
        description={viewModel.listing.address}
        actions={
          <span className="w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            {viewModel.project.lifecycleStatus}
          </span>
        }
      />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">TourScenes</h2>
        {!canUseSceneMediaTools ? (
          <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Authorize listing media for this Tour Project</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Scene media tools unlock after you acknowledge listing-media authorization.
                </p>
              </div>
            </div>
            <blockquote className="rounded-md border-l-4 border-primary bg-background px-4 py-3 text-sm text-foreground">
              {authorization.acknowledgementCopy}
            </blockquote>
            {acknowledgementMutation.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {acknowledgementMutation.error.message}
              </p>
            )}
            <Button
              type="button"
              disabled={acknowledgementMutation.isPending}
              onClick={() => acknowledgementMutation.mutate()}
            >
              {acknowledgementMutation.isPending ? "Recording..." : "I acknowledge listing-media authorization"}
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <form className="space-y-3 rounded-lg border border-border bg-muted/20 p-4" onSubmit={handleCreateScene}>
              <div className="flex gap-3">
                <ImagePlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Create a TourScene from a listing photo</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload the authoritative listing photo that should guide this scene.
                  </p>
                </div>
              </div>
              <label className="block text-sm font-medium text-foreground">
                TourScene title
                <input
                  type="text"
                  value={sceneTitle}
                  onChange={(event) => setSceneTitle(event.target.value)}
                  placeholder="Kitchen, primary bedroom, exterior..."
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Authoritative listing photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setScenePhoto(event.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                />
              </label>
              {scenePhotoPreviewUrl && (
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Preview before upload
                  </p>
                  <img
                    src={scenePhotoPreviewUrl}
                    alt="Selected authoritative listing photo preview"
                    className="max-h-80 w-full rounded-md object-contain"
                  />
                </div>
              )}
              {createSceneMutation.error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {createSceneMutation.error.message}
                </p>
              )}
              <Button type="submit" disabled={createSceneMutation.isPending}>
                {createSceneMutation.isPending ? "Creating TourScene..." : "Create TourScene"}
              </Button>
            </form>

            <aside className="space-y-3 rounded-lg border border-border bg-background p-4 lg:sticky lg:top-4 lg:self-start">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Walkthrough order</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Drag TourScenes in this sidebar into the intended property sequence, or use the move buttons.
                </p>
              </div>
              {tourScenes.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No TourScenes yet. Create the first scene from an authoritative listing photo.
                </p>
              ) : (
                <>
                  {(tourScenes.error ?? reorderScenesMutation.error) && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {(tourScenes.error ?? reorderScenesMutation.error)?.message}
                    </p>
                  )}
                  {toggleSceneInclusionMutation.error && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {toggleSceneInclusionMutation.error.message}
                    </p>
                  )}
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSceneDragEnd}>
                    <SortableContext items={tourScenes.itemIds} strategy={verticalListSortingStrategy}>
                      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                        {tourScenes.items.map((scene, index) => (
                          <SortableSceneCard
                            key={scene.id}
                            scene={scene}
                            index={index}
                            totalScenes={tourScenes.items.length}
                            isReordering={tourScenes.isPending || toggleSceneInclusionMutation.isPending}
                            onMove={moveScene}
                            onToggleInclusion={handleToggleSceneInclusion}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </aside>
          </div>
        )}
      </section>

      <InlineStatusBanner>
        <h2 className="text-sm font-semibold text-foreground">Future workflow readiness</h2>
        <div className="mt-3 divide-y divide-border">
          {(Object.keys(viewModel.readiness) as Array<keyof TourProjectWorkspaceViewModel["readiness"]>).map((key) => (
            <div key={key} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
              <h3 className="text-sm font-semibold text-foreground">{READINESS_LABELS[key]}</h3>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {viewModel.readiness[key].replace("_", " ")}
              </p>
            </div>
          ))}
        </div>
      </InlineStatusBanner>
    </PageFrame>
  );
}
