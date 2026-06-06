"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  EllipsisVertical,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { TourProjectWorkspaceViewModel, TourScene } from "@/lib/tours/workspace";
import { PageFrame } from "@/components/app-shell/PagePrimitives";
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
import { useOptimisticSortableList } from "@/hooks/useOptimisticSortableList";

type ProjectDetailsForm = {
  name: string;
  propertyAddress: string;
  listingUrl: string;
};

type SceneStripDragAxis = "horizontal" | "free";

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

async function replaceSceneListingPhoto(projectId: string, sceneId: string, formData: FormData) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/photo`, {
    method: "PATCH",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not replace the listing photo.");
  }
  return payload;
}

async function addSceneListingPhoto(projectId: string, sceneId: string, formData: FormData) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/photo`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not add the listing photo.");
  }
  return payload;
}

async function removeSceneListingPhoto(projectId: string, sceneId: string) {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/scenes/${sceneId}/photo`, {
    method: "DELETE",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not remove the listing photo.");
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

function sceneShortLabel(scene: TourScene, index: number) {
  return scene.title.trim().charAt(0).toUpperCase() || String(index + 1);
}

function ErrorMessage({ children }: { children: string }) {
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

function PhotoStageDropzone({
  scene,
  onAddPhoto,
  onReplacePhoto,
  children,
}: {
  scene: TourScene | null;
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
      {scene?.authoritativePhoto.previewUrl ? (
        <img
          src={scene.authoritativePhoto.previewUrl}
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
          Drop to replace photo
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

function SceneImageRail({
  scene,
  isAddingPhoto,
  pendingPhotoPreviewUrl,
  pendingPhotoName,
  onAddPhoto,
}: {
  scene: TourScene | null;
  isAddingPhoto: boolean;
  pendingPhotoPreviewUrl: string | null;
  pendingPhotoName: string | null;
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
          className={`h-[68px] w-[68px] overflow-hidden rounded-md border lg:h-[88px] lg:w-[88px] ${
            index === 0 ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/60"
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

function ProjectActionsMenu({
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

function SceneActionsMenu({
  scene,
  onReplacePhoto,
  onRemovePhoto,
  onDeleteScene,
  isRemovingPhoto,
}: {
  scene: TourScene;
  onReplacePhoto: () => void;
  onRemovePhoto: () => void;
  onDeleteScene: () => void;
  isRemovingPhoto: boolean;
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
            Replace photo
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive hover:text-destructive"
            disabled={!canRemovePhoto || isRemovingPhoto}
            title={canRemovePhoto ? undefined : "A scene needs at least one photo."}
            onClick={onRemovePhoto}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isRemovingPhoto ? "Removing..." : "Remove photo"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive hover:text-destructive" onClick={onDeleteScene}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete scene
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ProjectDetailsDialog({
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

function SceneUploadDialog({
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

function ReplacePhotoDialog({
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
            <DialogTitle>Replace photo</DialogTitle>
            <DialogClose onClose={() => onOpenChange(false)} />
          </DialogHeader>
          <DialogBody className="space-y-4">
            {scene && (
              <p className="text-sm text-muted-foreground">
                {scene.title}
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
              {isSaving ? "Replacing..." : "Replace photo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmText,
  error,
  isPending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmText: string;
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
            {isPending ? "Deleting..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  const [pendingScenePhoto, setPendingScenePhoto] = useState<{ sceneId: string; file: File } | null>(null);
  const [pendingScenePhotoPreviewUrl, setPendingScenePhotoPreviewUrl] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const sceneStripDragModifiers = getSceneStripDragModifiers(SCENE_STRIP_DND_CONFIG);
  const authorization = viewModel.listingMediaAuthorization;
  const canUseSceneMediaTools = authorization.hasAcknowledged;

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
  const createSceneMutation = useMutation({
    mutationFn: (formData: FormData) => createSceneFromListingPhoto(viewModel.project.id, formData),
    onSuccess: (payload) => {
      setSceneTitle("");
      setScenePhoto(null);
      setIsAddSceneOpen(false);
      if (typeof payload?.scene?.id === "string") {
        setPendingActiveSceneId(payload.scene.id);
        setActiveSceneId(payload.scene.id);
      }
      invalidateWorkspace();
    },
  });
  const replacePhotoMutation = useMutation({
    mutationFn: ({ sceneId, formData }: { sceneId: string; formData: FormData }) =>
      replaceSceneListingPhoto(viewModel.project.id, sceneId, formData),
    onSuccess: () => {
      setReplacementPhoto(null);
      setSceneToReplacePhoto(null);
      invalidateWorkspace();
    },
  });
  const addPhotoMutation = useMutation({
    mutationFn: ({ sceneId, formData }: { sceneId: string; formData: FormData }) =>
      addSceneListingPhoto(viewModel.project.id, sceneId, formData),
    onSuccess: invalidateWorkspace,
    onSettled: () => setPendingScenePhoto(null),
  });
  const removePhotoMutation = useMutation({
    mutationFn: (sceneId: string) => removeSceneListingPhoto(viewModel.project.id, sceneId),
    onSuccess: invalidateWorkspace,
  });
  const reorderScenesMutation = useMutation({
    mutationFn: (orderedSceneIds: string[]) => reorderTourScenes(viewModel.project.id, orderedSceneIds),
    onSuccess: invalidateWorkspace,
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
        `${scene.title}\u001e${scene.sortOrder}\u001e${scene.included}\u001e${scene.cameraMotion}\u001e${scene.authoritativePhoto.previewUrl ?? ""}\u001e${scene.sourcePhotos.map((photo) => `${photo.id}:${photo.previewUrl ?? ""}`).join("\u001d")}`,
      []
    ),
    isLocked: reorderScenesMutation.isPending,
    onPersistOrder: persistSceneOrder,
  });
  const toggleSceneInclusionMutation = useMutation({
    mutationFn: ({ sceneId, included }: { sceneId: string; included: boolean }) =>
      toggleSceneInclusion(viewModel.project.id, sceneId, included),
    onSuccess: invalidateWorkspace,
  });

  const activeScene = useMemo(
    () => tourScenes.items.find((scene) => scene.id === activeSceneId) ?? null,
    [activeSceneId, tourScenes.items]
  );
  const includedSceneCount = tourScenes.items.filter((scene) => scene.included).length;
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

  useEffect(() => {
    if (!pendingScenePhoto) {
      setPendingScenePhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(pendingScenePhoto.file);
    setPendingScenePhotoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [pendingScenePhoto]);

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
    setPendingScenePhoto({ sceneId, file });
    addPhotoMutation.mutate({ sceneId, formData });
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

  function confirmSceneDelete() {
    if (!sceneToDelete) {
      return;
    }

    handleToggleSceneInclusion(sceneToDelete.id, false).finally(() => {
      setSceneToDelete(null);
    });
  }

  return (
    <PageFrame className="max-w-none px-4 py-4 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-7xl lg:min-h-[calc(100vh-8rem)]">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {viewModel.project.name}
            </h1>
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
            <div
              className="mt-5 flex max-w-full touch-pan-x items-start gap-2 overflow-x-auto overflow-y-hidden pb-2"
              data-testid="tour-scene-strip"
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={sceneStripDragModifiers}
                onDragEnd={handleSceneDragEnd}
              >
                <SortableContext items={tourScenes.itemIds} strategy={horizontalListSortingStrategy}>
                  <div className="flex min-w-max flex-none gap-2">
                    {tourScenes.items.map((scene, index) => (
                      <SceneTabButton
                        key={scene.id}
                        scene={scene}
                        index={index}
                        isActive={scene.id === activeSceneId}
                        isReordering={tourScenes.isPending || reorderScenesMutation.isPending}
                        onSelect={() => setActiveSceneId(scene.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <button
                type="button"
                onClick={() => setIsAddSceneOpen(true)}
                aria-label="Add scene"
                className="flex h-16 w-16 flex-none items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-3 lg:grid-cols-[88px_minmax(0,1fr)]">
                <SceneImageRail
                  scene={activeScene}
                  isAddingPhoto={addPhotoMutation.isPending}
                  pendingPhotoPreviewUrl={
                    pendingScenePhoto?.sceneId === activeScene?.id ? pendingScenePhotoPreviewUrl : null
                  }
                  pendingPhotoName={
                    pendingScenePhoto?.sceneId === activeScene?.id ? pendingScenePhoto?.file.name ?? null : null
                  }
                  onAddPhoto={(file) => {
                    if (!activeScene) {
                      return;
                    }
                    handleAddScenePhoto(activeScene.id, file);
                  }}
                />

                <PhotoStageDropzone
                  scene={activeScene}
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
                      onReplacePhoto={() => {
                        setReplacementPhoto(null);
                        setSceneToReplacePhoto(activeScene);
                      }}
                      onRemovePhoto={() => removePhotoMutation.mutate(activeScene.id)}
                      onDeleteScene={() => setSceneToDelete(activeScene)}
                      isRemovingPhoto={removePhotoMutation.isPending}
                    />
                  )}
                  {activeScene && !activeScene.included && (
                    <span className="absolute bottom-3 left-3 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                      Skipped
                    </span>
                  )}
                </PhotoStageDropzone>
              </div>

              <section className="min-h-48 rounded-md border border-border bg-background p-4 lg:min-h-[420px]">
                {activeScene ? (
                  <div className="space-y-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{activeScene.title}</h2>
                      <p className="mt-1 text-xs uppercase text-muted-foreground">
                        Scene {tourScenes.items.findIndex((scene) => scene.id === activeScene.id) + 1} ·{" "}
                        {activeScene.cameraMotion.replace("_", " ")}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">Scene/image description</p>
                      <p className="mt-2">
                        Source image: {activeScene.authoritativePhoto.fileName}
                      </p>
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
                    onClick={() => setIsAddSceneOpen(true)}
                    className="flex min-h-40 w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-4 text-center hover:bg-muted/50 lg:min-h-[360px]"
                  >
                    <ImagePlus className="h-8 w-8 text-primary" />
                    <span className="mt-3 text-sm font-semibold text-foreground">Add first scene</span>
                  </button>
                )}
              </section>
            </div>

            {(tourScenes.error ??
              reorderScenesMutation.error ??
              toggleSceneInclusionMutation.error ??
              addPhotoMutation.error ??
              removePhotoMutation.error) && (
              <div className="mt-4">
                <ErrorMessage>
                  {(tourScenes.error ??
                    reorderScenesMutation.error ??
                    toggleSceneInclusionMutation.error ??
                    addPhotoMutation.error ??
                    removePhotoMutation.error)?.message ??
                    "Could not update TourScenes."}
                </ErrorMessage>
              </div>
            )}

            <Button
              type="button"
              className="mt-4 h-14 w-full text-base lg:ml-auto lg:block lg:max-w-sm"
              disabled={includedSceneCount === 0}
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
        title="Delete scene?"
        body="This removes the scene from the approval workflow by marking it skipped. The listing photo stays attached to the project."
        confirmText="Delete scene"
        error={toggleSceneInclusionMutation.error}
        isPending={toggleSceneInclusionMutation.isPending}
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
