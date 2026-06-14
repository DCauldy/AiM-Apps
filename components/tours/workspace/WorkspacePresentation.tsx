"use client";

import { FormEvent, type ReactNode } from "react";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import {
  Download,
  EllipsisVertical,
  Images,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
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
import { ElevenLabsVoiceSelector } from "./ElevenLabsVoiceSelector";
import { HeyGenAvatarSelector } from "./HeyGenAvatarSelector";
import type { HeyGenAvatarProjectPosition } from "./avatar-positioning";
import { appendDownloadTitle } from "./TourRenderStatusPanel";

export type ProjectDetailsForm = {
  name: string;
  propertyAddress: string;
  listingUrl: string;
  elevenLabsVoiceId: string;
  heyGenAvatarId: string;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
};

type TourScenePhoto = TourScene["sourcePhotos"][number];

const LISTING_MEDIA_IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
} as const;

function scenePhotoShortLabel(scene: TourScene, index: number) {
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
              {scenePhotoShortLabel(scene, index)}
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
  latestDownloadUrl,
  renderingHref,
  downloadTitle,
  canGenerateReuseAssets = false,
  isGeneratingReuseAssets = false,
  onGenerateReuseAssets,
  onEdit,
  onDelete,
}: {
  latestDownloadUrl?: string | null;
  renderingHref: string;
  downloadTitle: string;
  canGenerateReuseAssets?: boolean;
  isGeneratingReuseAssets?: boolean;
  onGenerateReuseAssets?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasRenderActions = Boolean(onGenerateReuseAssets || latestDownloadUrl);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Open project actions"
      >
        <EllipsisVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {onGenerateReuseAssets ? (
          <DropdownMenuItem
            disabled={!canGenerateReuseAssets || isGeneratingReuseAssets}
            onClick={onGenerateReuseAssets}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {isGeneratingReuseAssets ? "Starting render..." : "Generate and reuse assets"}
          </DropdownMenuItem>
        ) : null}
        {latestDownloadUrl ? (
          <DropdownMenuItem asChild>
            <a
              href={appendDownloadTitle(latestDownloadUrl, downloadTitle)}
              target="_blank"
              rel="noreferrer"
              download
            >
              <Download className="mr-2 h-4 w-4" />
              Download render
            </a>
          </DropdownMenuItem>
        ) : null}
        {latestDownloadUrl ? (
          <DropdownMenuItem asChild>
            <Link href={renderingHref}>
              <Images className="mr-2 h-4 w-4" />
              View render assets
            </Link>
          </DropdownMenuItem>
        ) : null}
        {hasRenderActions ? <DropdownMenuSeparator /> : null}
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
  selectedPhoto,
  onReplacePhoto,
  onRemovePhoto,
  onRemoveScene,
  isRemovingPhoto,
  isRemovingScene,
}: {
  scene: TourScene;
  selectedPhoto: TourScenePhoto | null;
  onReplacePhoto: () => void;
  onRemovePhoto: () => void;
  onRemoveScene: () => void;
  isRemovingPhoto: boolean;
  isRemovingScene: boolean;
}) {
  const canRemovePhoto = scene.sourcePhotos.length > 1;
  const selectedPhotoId = selectedPhoto?.id ?? scene.authoritativePhoto.id;
  const selectedPhotoLabel =
    selectedPhotoId === scene.authoritativePhoto.id ? "primary photo" : "secondary photo";

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
                ? `Removes the selected ${selectedPhotoLabel}.`
                : "A scene needs at least one photo."
            }
            onClick={onRemovePhoto}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isRemovingPhoto ? "Removing..." : `Remove ${selectedPhotoLabel}`}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive hover:text-destructive"
            disabled={isRemovingScene}
            onClick={onRemoveScene}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isRemovingScene ? "Removing..." : "Remove scene"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ProjectDetailsDialog({
  open,
  details,
  showVoiceId = false,
  showAvatarSettings = false,
  error,
  isSaving,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  details: ProjectDetailsForm;
  showVoiceId?: boolean;
  showAvatarSettings?: boolean;
  error: Error | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (details: ProjectDetailsForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isVoiceSelectionRequired = showVoiceId && !details.elevenLabsVoiceId.trim();
  const isAvatarSelectionRequired =
    showAvatarSettings && (!details.heyGenAvatarId.trim() || !details.heyGenAvatarPlacement);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (isVoiceSelectionRequired || isAvatarSelectionRequired) {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
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
            {showVoiceId ? (
              <div className="block text-sm font-medium text-foreground">
                <span>ElevenLabs digital twin voice</span>
                <div className="mt-1">
                  <ElevenLabsVoiceSelector
                    value={details.elevenLabsVoiceId}
                    disabled={isSaving}
                    onChange={(voiceId) => onChange({ ...details, elevenLabsVoiceId: voiceId })}
                  />
                </div>
                {isVoiceSelectionRequired ? (
                  <p className="mt-1 text-xs text-destructive">
                    Select a digital twin voice before saving.
                  </p>
                ) : null}
              </div>
            ) : null}
            {showAvatarSettings ? (
              <div className="block text-sm font-medium text-foreground">
                <span>HeyGen avatar look</span>
                <div className="mt-1">
                  <HeyGenAvatarSelector
                    value={details.heyGenAvatarId}
                    placement={details.heyGenAvatarPlacement}
                    disabled={isSaving}
                    onCommit={({ avatarId, placement }) =>
                      onChange({
                        ...details,
                        heyGenAvatarId: avatarId,
                        heyGenAvatarPlacement: placement,
                      })
                    }
                  />
                </div>
                {isAvatarSelectionRequired ? (
                  <p className="mt-1 text-xs text-destructive">
                    Select and position a HeyGen avatar before saving.
                  </p>
                ) : null}
              </div>
            ) : null}
            {error && <ErrorMessage>{error.message}</ErrorMessage>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || isVoiceSelectionRequired || isAvatarSelectionRequired}>
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
