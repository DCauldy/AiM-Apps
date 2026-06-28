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
import {
  ArrowRight,
  EllipsisVertical,
  GripVertical,
  ImagePlus,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
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
  deleteTourScene,
  reorderTourScenes,
  replaceAuthoritativeSceneListingPhoto,
} from "@/components/tours/tours-api-client";
import { useTourProjectWorkspace } from "./useTourProjectWorkspace";
import {
  ConfirmDialog,
  ErrorMessage,
  ReplacePhotoDialog,
  SceneUploadDialog,
} from "./WorkspacePresentation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TourProjectWorkspace() {
  const { viewModel, acknowledgementMutation, invalidateWorkspace } = useTourProjectWorkspace();
  const [isCreateSceneOpen, setIsCreateSceneOpen] = useState(false);
  const [sceneToReplacePhoto, setSceneToReplacePhoto] = useState<TourScene | null>(null);
  const [replacementPhoto, setReplacementPhoto] = useState<File | null>(null);
  const [replacementPhotoPreviewUrl, setReplacementPhotoPreviewUrl] = useState<string | null>(null);
  const [sceneToDelete, setSceneToDelete] = useState<TourScene | null>(null);
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
  const replacePhotoMutation = useMutation({
    mutationFn: ({ sceneId, formData }: { sceneId: string; formData: FormData }) =>
      replaceAuthoritativeSceneListingPhoto(viewModel.project.id, sceneId, formData),
    onSuccess: () => {
      setReplacementPhoto(null);
      setSceneToReplacePhoto(null);
      invalidateWorkspace();
    },
  });
  const deleteSceneMutation = useMutation({
    mutationFn: (sceneId: string) => deleteTourScene(viewModel.project.id, sceneId),
    onSuccess: (_payload, deletedSceneId) => {
      sortableScenes.setItems(
        sortableScenes.items.filter((scene) => scene.id !== deletedSceneId)
      );
      setSceneToDelete(null);
      invalidateWorkspace();
    },
  });
  const authorization = viewModel.listingMediaAuthorization;

  useEffect(() => {
    if (!replacementPhoto) {
      setReplacementPhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(replacementPhoto);
    setReplacementPhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [replacementPhoto]);

  function handleReplaceScenePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sceneToReplacePhoto) {
      return;
    }

    const formData = new FormData();
    if (replacementPhoto) {
      formData.set("photo", replacementPhoto);
    }
    replacePhotoMutation.mutate({
      sceneId: sceneToReplacePhoto.id,
      formData,
    });
  }

  function confirmSceneDelete() {
    if (!sceneToDelete) {
      return;
    }

    deleteSceneMutation.mutate(sceneToDelete.id);
  }

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
        isReplacingPhoto={replacePhotoMutation.isPending}
        isDeletingScene={deleteSceneMutation.isPending}
        onAddScene={() => setIsCreateSceneOpen(true)}
        onReplaceScenePhoto={setSceneToReplacePhoto}
        onRemoveScene={setSceneToDelete}
        onDragEnd={handleSceneDragEnd}
      />
      {sortableScenes.error ? (
        <div className="mt-4">
          <ErrorMessage>{sortableScenes.error.message}</ErrorMessage>
        </div>
      ) : null}
      <ReplacePhotoDialog
        open={Boolean(sceneToReplacePhoto)}
        scene={sceneToReplacePhoto}
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
  isReplacingPhoto,
  isDeletingScene,
  onAddScene,
  onReplaceScenePhoto,
  onRemoveScene,
  onDragEnd,
}: {
  scenes: TourScene[];
  itemIds: string[];
  projectId: string;
  isReordering: boolean;
  isReplacingPhoto: boolean;
  isDeletingScene: boolean;
  onAddScene: () => void;
  onReplaceScenePhoto: (scene: TourScene) => void;
  onRemoveScene: (scene: TourScene) => void;
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
              isReplacingPhoto={isReplacingPhoto}
              isDeletingScene={isDeletingScene}
              onReplacePhoto={() => onReplaceScenePhoto(scene)}
              onRemoveScene={() => onRemoveScene(scene)}
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
  isReplacingPhoto,
  isDeletingScene,
  onReplacePhoto,
  onRemoveScene,
}: {
  scene: TourScene;
  projectId: string;
  index: number;
  isReordering: boolean;
  isReplacingPhoto: boolean;
  isDeletingScene: boolean;
  onReplacePhoto: () => void;
  onRemoveScene: () => void;
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
      isReplacingPhoto={isReplacingPhoto}
      isDeletingScene={isDeletingScene}
      onReplacePhoto={onReplacePhoto}
      onRemoveScene={onRemoveScene}
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
  isReplacingPhoto?: boolean;
  isDeletingScene?: boolean;
  style?: CSSProperties;
  onReplacePhoto: () => void;
  onRemoveScene: () => void;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement> & {
    ref: (element: HTMLButtonElement | null) => void;
  };
};

const SceneCard = forwardRef<HTMLElement, SceneCardProps>(function SceneCard(
  {
    scene,
    projectId,
    index,
    isDragging = false,
    isReplacingPhoto = false,
    isDeletingScene = false,
    style,
    onReplacePhoto,
    onRemoveScene,
    dragHandleProps,
  },
  ref
) {
  return (
    <article
      ref={ref}
      style={style}
      className={`rounded-md border border-border bg-card transition-shadow ${
        isDragging ? "z-10 shadow-lg ring-2 ring-primary/25" : ""
      }`}
    >
      <div className="relative aspect-video overflow-hidden rounded-t-md bg-muted">
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
        <div className="flex shrink-0 items-center gap-2">
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
          <SceneCardActionsMenu
            sceneTitle={scene.title}
            disabled={isReplacingPhoto || isDeletingScene}
            onReplacePhoto={onReplacePhoto}
            onRemoveScene={onRemoveScene}
          />
        </div>
      </div>
    </article>
  );
});

function SceneCardActionsMenu({
  sceneTitle,
  disabled,
  onReplacePhoto,
  onRemoveScene,
}: {
  sceneTitle: string;
  disabled: boolean;
  onReplacePhoto: () => void;
  onRemoveScene: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        aria-label={`Open scene actions for ${sceneTitle}`}
        disabled={disabled}
      >
        <EllipsisVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onReplacePhoto}>
          <ImagePlus className="mr-2 h-4 w-4" />
          Replace primary photo
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive hover:text-destructive"
          onClick={onRemoveScene}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remove scene
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
