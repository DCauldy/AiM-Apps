"use client";

import { Button } from "@/components/ui/button";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, GripVertical, Plus, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormEvent,
  forwardRef,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { useOptimisticSortableList, type OptimisticSortableId } from "@/hooks/useOptimisticSortableList";
import type { TourScene } from "@/lib/tours/workspace";
import { getTourSceneCameraMotionLabel } from "@/lib/tours/scenes.core";
import {
  createSceneFromListingPhoto,
  reorderTourScenes,
} from "@/components/tours/tours-api-client";
import { useTourProjectWorkspace } from "./useTourProjectWorkspace";
import { ErrorMessage, SceneUploadDialog } from "./WorkspacePresentation";

export function TourProjectWorkspace() {
  const { viewModel, acknowledgementMutation, invalidateWorkspace } = useTourProjectWorkspace();
  const [isCreateSceneOpen, setIsCreateSceneOpen] = useState(false);
  const createSceneForm = useCreateSceneForm({
    projectId: viewModel.project.id,
    invalidateWorkspace,
    onCreated: () => setIsCreateSceneOpen(false),
  });
  const scenes = viewModel.tourScenes;
  const persistSceneOrder = useCallback(
    async (orderedSceneIds: string[]) => {
      await reorderTourScenes(
        viewModel.project.id,
        orderedSceneIds,
        "Could not save the scene order."
      );
      invalidateWorkspace();
    },
    [invalidateWorkspace, viewModel.project.id]
  );
  const sortableScenes = useOptimisticSortableList({
    items: scenes,
    getId: useCallback((scene: TourScene) => scene.id, []),
    getSyncKey: useCallback(
      (scene: TourScene) =>
        `${scene.title}\u001e${scene.sortOrder}\u001e${scene.included}\u001e${scene.cameraMotion}\u001e${scene.authoritativePhoto.previewUrl ?? ""}`,
      []
    ),
    onPersistOrder: persistSceneOrder,
  });
  const handleSceneDragEnd = useSceneCardDragEnd({
    reorderById: sortableScenes.reorderById,
  });
  const authorization = viewModel.listingMediaAuthorization;

  if (!authorization.hasAcknowledged) {
    return (
      <ListingMediaAuthorizationPanel
        acknowledgementCopy={authorization.acknowledgementCopy}
        error={acknowledgementMutation.error}
        isPending={acknowledgementMutation.isPending}
        onAcknowledge={() => acknowledgementMutation.mutate()}
      />
    );
  }

  if (scenes.length === 0) {
    return (
      <>
        <div className="mt-5 rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
          <h2 className="text-sm font-semibold text-foreground">No scenes yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the first scene with a title and listing photo.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => setIsCreateSceneOpen(true)}
          >
            Add scene
            <Plus />
          </Button>
        </div>
        <SceneUploadDialog
          open={isCreateSceneOpen}
          title={createSceneForm.sceneTitle}
          photoPreviewUrl={createSceneForm.scenePhotoPreviewUrl}
          photoName={createSceneForm.scenePhoto?.name ?? null}
          error={createSceneForm.createSceneMutation.error}
          isSaving={createSceneForm.createSceneMutation.isPending}
          onOpenChange={setIsCreateSceneOpen}
          onTitleChange={createSceneForm.setSceneTitle}
          onPhotoChange={createSceneForm.setScenePhoto}
          onSubmit={createSceneForm.handleCreateScene}
        />
      </>
    );
  }

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-lg">Scenes</h3>
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsCreateSceneOpen((open) => !open)}
        >
          {isCreateSceneOpen ? "Close" : "Add scene"}
          {isCreateSceneOpen ? <X /> : <Plus />}
        </Button>
      </header>
      <SceneUploadDialog
        open={isCreateSceneOpen}
        title={createSceneForm.sceneTitle}
        photoPreviewUrl={createSceneForm.scenePhotoPreviewUrl}
        photoName={createSceneForm.scenePhoto?.name ?? null}
        error={createSceneForm.createSceneMutation.error}
        isSaving={createSceneForm.createSceneMutation.isPending}
        onOpenChange={setIsCreateSceneOpen}
        onTitleChange={createSceneForm.setSceneTitle}
        onPhotoChange={createSceneForm.setScenePhoto}
        onSubmit={createSceneForm.handleCreateScene}
      />
      <SortableSceneGrid
        scenes={sortableScenes.items}
        itemIds={sortableScenes.itemIds}
        projectId={viewModel.project.id}
        isReordering={sortableScenes.isPending}
        onAddScene={() => setIsCreateSceneOpen(true)}
        onDragEnd={handleSceneDragEnd}
      />
      {sortableScenes.error ? (
        <div className="mt-4">
          <ErrorMessage>{sortableScenes.error.message}</ErrorMessage>
        </div>
      ) : null}
    </>
  );
}

function ListingMediaAuthorizationPanel({
  acknowledgementCopy,
  error,
  isPending,
  onAcknowledge,
}: {
  acknowledgementCopy: string;
  error: Error | null;
  isPending: boolean;
  onAcknowledge: () => void;
}) {
  return (
    <div className="mt-5 space-y-4 rounded-md border border-border bg-muted/30 p-4">
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
        {acknowledgementCopy}
      </blockquote>
      {error ? <ErrorMessage>{error.message}</ErrorMessage> : null}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={isPending}
        onClick={onAcknowledge}
      >
        {isPending ? "Recording..." : "I acknowledge"}
      </Button>
    </div>
  );
}

function useCreateSceneForm({
  projectId,
  invalidateWorkspace,
  onCreated,
}: {
  projectId: string;
  invalidateWorkspace: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [sceneTitle, setSceneTitle] = useState("");
  const [scenePhoto, setScenePhoto] = useState<File | null>(null);
  const [scenePhotoPreviewUrl, setScenePhotoPreviewUrl] = useState<string | null>(null);
  const createSceneMutation = useMutation({
    mutationFn: (formData: FormData) =>
      createSceneFromListingPhoto(projectId, formData, "Could not create the scene."),
    onSuccess: (payload) => {
      const sceneId = typeof payload.scene?.id === "string" ? payload.scene.id : null;
      setSceneTitle("");
      setScenePhoto(null);
      invalidateWorkspace();
      onCreated();
      if (sceneId) {
        router.push(`/apps/tours/projects/${projectId}/${sceneId}`);
      }
    },
  });

  useEffect(() => {
    if (!scenePhoto) {
      setScenePhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(scenePhoto);
    setScenePhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [scenePhoto]);

  const handleCreateScene = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData();
      formData.set("title", sceneTitle);
      if (scenePhoto) {
        formData.set("photo", scenePhoto);
      }
      createSceneMutation.mutate(formData);
    },
    [createSceneMutation, scenePhoto, sceneTitle]
  );

  return {
    sceneTitle,
    setSceneTitle,
    scenePhoto,
    setScenePhoto,
    scenePhotoPreviewUrl,
    createSceneMutation,
    handleCreateScene,
  };
}

function useSceneCardDragEnd({
  reorderById,
}: {
  reorderById: (activeId: OptimisticSortableId, overId: OptimisticSortableId | null | undefined) => void;
}) {
  return useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      reorderById(active.id, over?.id);
    },
    [reorderById]
  );
}

function SortableSceneGrid({
  scenes,
  itemIds,
  projectId,
  isReordering,
  onAddScene,
  onDragEnd,
}: {
  scenes: TourScene[];
  itemIds: string[];
  projectId: string;
  isReordering: boolean;
  onAddScene: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {scenes.map((scene, index) => (
            <SortableSceneCard
              projectId={projectId}
              key={scene.id}
              scene={scene}
              index={index}
              isReordering={isReordering}
            />
          ))}
          <AddSceneCard onAddScene={onAddScene} />
        </div>
      </SortableContext>
    </DndContext>
  );
}

function AddSceneCard({ onAddScene }: { onAddScene: () => void }) {
  return (
    <button
      type="button"
      onClick={onAddScene}
      aria-label="Add scene"
      className="flex min-h-[272px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-muted hover:text-foreground"
    >
      <Plus className="h-10 w-10" />
    </button>
  );
}

function SortableSceneCard({
  scene,
  projectId,
  index,
  isReordering,
}: {
  scene: TourScene;
  projectId: string;
  index: number;
  isReordering: boolean;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: scene.id,
    disabled: isReordering,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <SceneCard
      ref={setNodeRef}
      style={style}
      scene={scene}
      projectId={projectId}
      index={index}
      isDragging={isDragging}
      dragHandleProps={{
        ref: setActivatorNodeRef,
        disabled: isReordering,
        ...attributes,
        ...listeners,
      }}
    />
  );
}

type SceneCardProps = {
  scene: TourScene;
  projectId: string;
  index: number;
  isDragging?: boolean;
  style?: CSSProperties;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement> & {
    ref: (element: HTMLButtonElement | null) => void;
  };
};

const SceneCard = forwardRef<HTMLElement, SceneCardProps>(function SceneCard(
  { scene, projectId, index, isDragging = false, style, dragHandleProps },
  ref
) {
  return (
    <article
      ref={ref}
      style={style}
      className={`overflow-hidden rounded-md border border-border bg-card transition-shadow ${
        isDragging ? "z-10 shadow-lg ring-2 ring-primary/25" : ""
      }`}
    >
      <div className="relative aspect-video bg-muted">
        <Link
          href={`/apps/tours/projects/${projectId}/${scene.id}`}
          aria-label={`Open ${scene.title}`}
          className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {scene.authoritativePhoto.previewUrl ? (
            <img
              src={scene.authoritativePhoto.previewUrl}
              alt={`Listing photo for ${scene.title}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {scene.title.trim().charAt(0).toUpperCase() || index + 1}
            </div>
          )}
        </Link>
        {dragHandleProps ? (
          <button
            type="button"
            aria-label={`Reorder ${scene.title}`}
            className="absolute left-3 top-3 flex h-9 w-9 cursor-grab items-center justify-center rounded-md bg-background/85 text-muted-foreground backdrop-blur transition-colors hover:bg-background hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-base font-semibold text-foreground">
            {scene.title}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {getTourSceneCameraMotionLabel(scene.cameraMotion)}
          </p>
        </div>
        <Button
          asChild
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <Link href={`/apps/tours/projects/${projectId}/${scene.id}`}>
            Open scene
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
});
