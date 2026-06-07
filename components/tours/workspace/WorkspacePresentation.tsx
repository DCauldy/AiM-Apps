"use client";

import { FormEvent, type ReactNode } from "react";
import { useDropzone } from "react-dropzone";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  type Modifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, EllipsisVertical, ImagePlus, Loader2, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import type { TourScene } from "@/lib/tours/workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ProjectDetailsForm = {
  name: string;
  propertyAddress: string;
  listingUrl: string;
};

type SceneStripDragAxis = "horizontal" | "free";
type TourScenePhoto = TourScene["sourcePhotos"][number];

const SCENE_STRIP_DND_CONFIG: {
  dragAxis: SceneStripDragAxis;
} = {
  dragAxis: "horizontal",
};

const LISTING_MEDIA_IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
} as const;

const restrictSceneDragToHorizontalAxis: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

function getSceneStripDragModifiers(config: typeof SCENE_STRIP_DND_CONFIG) {
  const modifiers: Modifier[] = [];
  if (config.dragAxis === "horizontal") {
    modifiers.push(restrictSceneDragToHorizontalAxis);
  }
  return modifiers;
}

function getSceneStripTransform(transform: Parameters<typeof CSS.Transform.toString>[0]) {
  if (!transform || SCENE_STRIP_DND_CONFIG.dragAxis !== "horizontal") {
    return transform;
  }

  return {
    ...transform,
    y: 0,
  };
}

function sceneShortLabel(scene: TourScene, index: number) {
  return scene.title.trim().charAt(0).toUpperCase() || String(index + 1);
}

export function ErrorMessage({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

function FileDropzone({
  id,
  label,
  previewUrl,
  fileName,
  onChange,
}: {
  id: string;
  label: string;
  previewUrl: string | null;
  fileName: string | null;
  onChange: (file: File | null) => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: LISTING_MEDIA_IMAGE_ACCEPT,
    multiple: false,
    onDrop: (acceptedFiles) => onChange(acceptedFiles[0] ?? null),
  });

  return (
    <div
      {...getRootProps({
        className: `flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-4 text-center transition-colors ${
          isDragActive ? "border-primary bg-primary/10" : "border-border bg-muted/40 hover:bg-muted"
        }`,
      })}
    >
      <input {...getInputProps({ id })} />
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={fileName ? `Selected listing photo ${fileName}` : "Selected listing photo preview"}
          className="h-full w-full rounded-md object-cover"
        />
      ) : (
        <>
          <UploadCloud className="h-8 w-8 text-primary" />
          <span className="mt-3 text-sm font-semibold text-foreground">{label}</span>
          <span className="mt-1 text-xs text-muted-foreground">JPEG, PNG, or WebP</span>
        </>
      )}
    </div>
  );
}

export function PhotoStageDropzone({
  scene,
  displayPhoto,
  onAddPhoto,
  onReplacePhoto,
  children,
}: {
  scene: TourScene | null;
  displayPhoto: TourScenePhoto | null;
  onAddPhoto: (file: File) => void;
  onReplacePhoto: (file: File) => void;
  children?: ReactNode;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: LISTING_MEDIA_IMAGE_ACCEPT,
    multiple: false,
    noClick: Boolean(scene),
    noKeyboard: Boolean(scene),
    onDrop: (acceptedFiles) => {
      const [file] = acceptedFiles;
      if (!file) {
        return;
      }
      if (scene) {
        onReplacePhoto(file);
      } else {
        onAddPhoto(file);
      }
    },
  });

  return (
    <div
      {...getRootProps({
        className: `relative aspect-[4/3] overflow-hidden rounded-md border bg-muted transition-colors lg:aspect-video ${
          isDragActive ? "border-primary bg-primary/10" : "border-border"
        }`,
      })}
    >
      <input {...getInputProps()} />
      {scene && displayPhoto?.previewUrl ? (
        <img
          src={displayPhoto.previewUrl}
          alt={`Listing photo for ${scene.title}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
          <UploadCloud className="h-8 w-8 text-primary" />
          <span className="mt-3 text-sm font-semibold text-foreground">
            {isDragActive ? "Drop photo" : "Photo or dropzone"}
          </span>
        </div>
      )}
      {isDragActive && scene ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-sm font-semibold text-foreground backdrop-blur-sm">
          Drop to replace primary photo
        </div>
      ) : null}
      {children}
    </div>
  );
}

function SceneTabButton({
  scene,
  index,
  isActive,
  isReordering,
  onSelect,
}: {
  scene: TourScene;
  index: number;
  isActive: boolean;
  isReordering: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
    disabled: isReordering,
  });
  const style = {
    transform: CSS.Transform.toString(getSceneStripTransform(transform)),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onSelect}
      disabled={isReordering}
      className={`relative h-16 w-16 flex-none cursor-grab touch-pan-x overflow-hidden rounded-md border bg-muted text-sm font-semibold transition-colors active:cursor-grabbing disabled:cursor-not-allowed ${
        isActive
          ? "border-primary ring-2 ring-primary/25"
          : "border-border bg-background text-foreground hover:border-primary/60"
      } ${scene.included ? "" : "opacity-60"} ${isDragging ? "z-10 shadow-lg" : ""}`}
      {...attributes}
      {...listeners}
    >
      {scene.authoritativePhoto.previewUrl ? (
        <img
          src={scene.authoritativePhoto.previewUrl}
          alt={`${scene.title} scene`}
          className="h-16 w-16 object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center bg-muted">
          {sceneShortLabel(scene, index)}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1.5 py-1 text-left text-[11px] font-medium text-foreground backdrop-blur-sm">
        {scene.title}
      </span>
    </button>
  );
}

export function SceneImageRail({
  scene,
  selectedPhotoId,
  isAddingPhoto,
  pendingPhotoPreviewUrl,
  pendingPhotoName,
  onSelectPhoto,
  onAddPhoto,
}: {
  scene: TourScene | null;
  selectedPhotoId: string | null;
  isAddingPhoto: boolean;
  pendingPhotoPreviewUrl: string | null;
  pendingPhotoName: string | null;
  onSelectPhoto: (photoId: string) => void;
  onAddPhoto: (file: File) => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: LISTING_MEDIA_IMAGE_ACCEPT,
    multiple: false,
    disabled: !scene || isAddingPhoto,
    onDrop: (acceptedFiles) => {
      const [file] = acceptedFiles;
      if (file) {
        onAddPhoto(file);
      }
    },
  });

  if (!scene) {
    return (
      <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto lg:max-h-[calc(100vh-18rem)]">
        <div className="h-[68px] w-[68px] rounded-md border border-dashed border-border bg-muted/40 lg:h-[88px] lg:w-[88px]" />
      </div>
    );
  }

  const sourcePhotos = scene.sourcePhotos.length > 0 ? scene.sourcePhotos : [scene.authoritativePhoto];

  return (
    <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto lg:max-h-[calc(100vh-18rem)]">
      {sourcePhotos.map((photo, index) => (
        <button
          key={photo.id}
          type="button"
          onClick={() => onSelectPhoto(photo.id)}
          className={`h-[68px] w-[68px] overflow-hidden rounded-md border lg:h-[88px] lg:w-[88px] ${
            photo.id === selectedPhotoId ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/60"
          }`}
          aria-label={`View ${scene.title} image ${index + 1}`}
        >
          {photo.previewUrl ? (
            <img
              src={photo.previewUrl}
              alt={`${scene.title} image ${index + 1}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-muted text-sm font-semibold">
              {sceneShortLabel(scene, index)}
            </span>
          )}
        </button>
      ))}
      {isAddingPhoto && pendingPhotoPreviewUrl ? (
        <div className="relative h-[68px] w-[68px] overflow-hidden rounded-md border border-primary/60 bg-muted lg:h-[88px] lg:w-[88px]">
          <img
            src={pendingPhotoPreviewUrl}
            alt={pendingPhotoName ? `Uploading ${pendingPhotoName}` : "Uploading listing photo"}
            className="h-full w-full object-cover opacity-70"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-background/45 backdrop-blur-[1px]">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        </div>
      ) : null}
      <button
        {...getRootProps({
          type: "button",
          className: `flex h-[68px] w-[68px] items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors lg:h-[88px] lg:w-[88px] ${
            isDragActive ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/20 hover:bg-muted/40 hover:text-foreground"
          } ${isAddingPhoto ? "cursor-wait opacity-60" : ""}`,
          "aria-label": `Add photo to ${scene.title}`,
        })}
      >
        <input {...getInputProps()} />
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

export function ProjectActionsMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Open project actions"
      >
        <EllipsisVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SceneActionsMenu({
  scene,
  onReplacePhoto,
  onRemovePhoto,
  onToggleInclusion,
  isRemovingPhoto,
  isUpdatingInclusion,
}: {
  scene: TourScene;
  onReplacePhoto: () => void;
  onRemovePhoto: () => void;
  onToggleInclusion: () => void;
  isRemovingPhoto: boolean;
  isUpdatingInclusion: boolean;
}) {
  const canRemovePhoto = scene.sourcePhotos.length > 1;

  return (
    <div className="absolute right-3 top-3 z-30">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-9 w-9 items-center justify-center rounded-md bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:bg-background hover:text-foreground"
          aria-label={`Open photo actions for ${scene.title}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <EllipsisVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onReplacePhoto}>
            <ImagePlus className="mr-2 h-4 w-4" />
            Replace primary photo
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive hover:text-destructive"
            disabled={!canRemovePhoto || isRemovingPhoto}
            title={
              canRemovePhoto
                ? "Removes the primary photo; rail thumbnail selection only changes the displayed image."
                : "A scene needs at least one primary photo."
            }
            onClick={onRemovePhoto}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isRemovingPhoto ? "Removing..." : "Remove primary photo"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className={scene.included ? "text-destructive hover:text-destructive" : undefined}
            disabled={isUpdatingInclusion}
            onClick={onToggleInclusion}
          >
            {scene.included ? (
              <Trash2 className="mr-2 h-4 w-4" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {scene.included ? "Skip scene" : "Include scene"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ProjectDetailsDialog({
  open,
  details,
  error,
  isSaving,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  details: ProjectDetailsForm;
  error: Error | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (details: ProjectDetailsForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit project details</DialogTitle>
            <DialogClose onClose={() => onOpenChange(false)} />
          </DialogHeader>
          <DialogBody className="space-y-4">
            <label className="block text-sm font-medium text-foreground">
              Property name
              <input
                type="text"
                value={details.name}
                onChange={(event) => onChange({ ...details, name: event.target.value })}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Address
              <input
                type="text"
                value={details.propertyAddress}
                onChange={(event) => onChange({ ...details, propertyAddress: event.target.value })}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Listing URL
              <input
                type="url"
                value={details.listingUrl}
                onChange={(event) => onChange({ ...details, listingUrl: event.target.value })}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            {error && <ErrorMessage>{error.message}</ErrorMessage>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save details"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SceneUploadDialog({
  open,
  title,
  photoPreviewUrl,
  photoName,
  error,
  isSaving,
  onOpenChange,
  onTitleChange,
  onPhotoChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  photoPreviewUrl: string | null;
  photoName: string | null;
  error: Error | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onTitleChange: (title: string) => void;
  onPhotoChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add scene</DialogTitle>
            <DialogClose onClose={() => onOpenChange(false)} />
          </DialogHeader>
          <DialogBody className="space-y-4">
            <label className="block text-sm font-medium text-foreground">
              Scene name
              <input
                type="text"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder="Kitchen, primary bedroom, exterior..."
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <FileDropzone
              id="new-scene-photo"
              label="Upload listing photo"
              previewUrl={photoPreviewUrl}
              fileName={photoName}
              onChange={onPhotoChange}
            />
            {error && <ErrorMessage>{error.message}</ErrorMessage>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Creating..." : "Create scene"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReplacePhotoDialog({
  open,
  scene,
  photoPreviewUrl,
  photoName,
  error,
  isSaving,
  onOpenChange,
  onPhotoChange,
  onSubmit,
}: {
  open: boolean;
  scene: TourScene | null;
  photoPreviewUrl: string | null;
  photoName: string | null;
  error: Error | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onPhotoChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Replace primary photo</DialogTitle>
            <DialogClose onClose={() => onOpenChange(false)} />
          </DialogHeader>
          <DialogBody className="space-y-4">
            {scene && (
              <p className="text-sm text-muted-foreground">
                {scene.title}. This updates the primary listing photo; rail thumbnail selection only changes the displayed image.
              </p>
            )}
            <FileDropzone
              id="replacement-scene-photo"
              label="Choose replacement"
              previewUrl={photoPreviewUrl}
              fileName={photoName}
              onChange={onPhotoChange}
            />
            {error && <ErrorMessage>{error.message}</ErrorMessage>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !scene}>
              {isSaving ? "Replacing..." : "Replace primary photo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmText,
  pendingText,
  error,
  isPending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmText: string;
  pendingText?: string;
  error: Error | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-muted-foreground">{body}</p>
          {error && <ErrorMessage>{error.message}</ErrorMessage>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? pendingText ?? "Deleting..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export function SceneStrip({
  scenes,
  itemIds,
  activeSceneId,
  isReordering,
  onSelectScene,
  onAddScene,
  onDragEnd,
}: {
  scenes: TourScene[];
  itemIds: string[];
  activeSceneId: string | null;
  isReordering: boolean;
  onSelectScene: (sceneId: string) => void;
  onAddScene: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const sceneStripDragModifiers = getSceneStripDragModifiers(SCENE_STRIP_DND_CONFIG);

  return (
    <div
      className="mt-5 flex max-w-full touch-pan-x items-start gap-2 overflow-x-auto overflow-y-hidden pb-2"
      data-testid="tour-scene-strip"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={sceneStripDragModifiers}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
          <div className="flex min-w-max flex-none gap-2">
            {scenes.map((scene, index) => (
              <SceneTabButton
                key={scene.id}
                scene={scene}
                index={index}
                isActive={scene.id === activeSceneId}
                isReordering={isReordering}
                onSelect={() => onSelectScene(scene.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={onAddScene}
        aria-label="Add scene"
        className="flex h-16 w-16 flex-none items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}

export function SceneDetailsPanel({
  activeScene,
  displayPhoto,
  sceneIndex,
  onAddScene,
}: {
  activeScene: TourScene | null;
  displayPhoto: TourScenePhoto | null;
  sceneIndex: number;
  onAddScene: () => void;
}) {
  return (
    <section className="min-h-48 rounded-md border border-border bg-background p-4 lg:min-h-[420px]">
      {activeScene ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">{activeScene.title}</h2>
            <p className="mt-1 text-xs uppercase text-muted-foreground">
              Scene {sceneIndex + 1} · {activeScene.cameraMotion.replace("_", " ")}
            </p>
          </div>
          <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Scene/image description</p>
            <p className="mt-2">Primary source image: {activeScene.authoritativePhoto.fileName}</p>
            {displayPhoto && displayPhoto.id !== activeScene.authoritativePhoto.id ? (
              <p className="mt-1">Viewing display image: {displayPhoto.fileName}</p>
            ) : null}
            <p className="mt-1">
              {activeScene.included
                ? "Included for the approval workflow."
                : "Skipped from the approval workflow."}
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAddScene}
          className="flex min-h-40 w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-4 text-center hover:bg-muted/50 lg:min-h-[360px]"
        >
          <ImagePlus className="h-8 w-8 text-primary" />
          <span className="mt-3 text-sm font-semibold text-foreground">Add first scene</span>
        </button>
      )}
    </section>
  );
}
