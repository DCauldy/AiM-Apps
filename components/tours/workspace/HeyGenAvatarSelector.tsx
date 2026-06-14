"use client";

import { type PointerEvent, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ImageIcon, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  projectPositionToPreviewRect,
  previewRectToProjectPosition,
  type AvatarPreviewRect,
  type HeyGenAvatarProjectPosition,
} from "@/components/tours/workspace/avatar-positioning";
import { cn } from "@/lib/utils";

export type HeyGenAvatarLook = {
  id: string;
  name: string;
  avatarType: string;
  groupId: string | null;
  gender: string | null;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
  tags: string[];
  supportedApiEngines: string[];
  status: string | null;
};

type HeyGenAvatarsResponse = {
  avatars: HeyGenAvatarLook[];
};

type AvatarSelectorMode = "details" | "choose-avatar" | "position-avatar";

const POSITION_FRAME = { width: 270, height: 480 } as const;
const AVATAR_PREVIEW_ASPECT_RATIO = 16 / 9;
const AVATAR_PREVIEW_ASPECT_RATIO_TOLERANCE = 0.02;
const DEFAULT_PREVIEW_RECT: AvatarPreviewRect = {
  frameWidth: POSITION_FRAME.width,
  frameHeight: POSITION_FRAME.height,
  left: 30,
  top: 345,
  width: 240,
  height: 135,
};

async function fetchHeyGenAvatarLooks() {
  const response = await fetch("/api/apps/tours/avatars");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load HeyGen avatars.");
  }
  return payload as HeyGenAvatarsResponse;
}

export function HeyGenAvatarSelector({
  value,
  placement,
  disabled = false,
  onCommit,
}: {
  value: string;
  placement: HeyGenAvatarProjectPosition | null;
  disabled?: boolean;
  onCommit: (selection: { avatarId: string; placement: HeyGenAvatarProjectPosition }) => void;
}) {
  const [mode, setMode] = useState<AvatarSelectorMode>("details");
  const [draftAvatarId, setDraftAvatarId] = useState("");
  const [draftRect, setDraftRect] = useState<AvatarPreviewRect>(DEFAULT_PREVIEW_RECT);
  const avatarsQuery = useQuery({
    queryKey: ["tours", "heygen", "digital-twin-avatar-looks"],
    queryFn: fetchHeyGenAvatarLooks,
    staleTime: 5 * 60 * 1000,
  });
  const avatars = avatarsQuery.data?.avatars ?? [];
  const selectedAvatar = useMemo(
    () => avatars.find((avatar) => avatar.id === value) ?? null,
    [value, avatars]
  );
  const draftAvatar = useMemo(
    () => avatars.find((avatar) => avatar.id === draftAvatarId) ?? selectedAvatar,
    [avatars, draftAvatarId, selectedAvatar]
  );

  function openChooser() {
    const placementRect = placement
      ? projectPositionToPreviewRect({
          position: placement,
          frameWidth: POSITION_FRAME.width,
          frameHeight: POSITION_FRAME.height,
        })
      : null;
    setDraftAvatarId(value);
    setDraftRect(
      placementRect && isAvatarPreviewRectSixteenByNine(placementRect)
        ? placementRect
        : DEFAULT_PREVIEW_RECT
    );
    setMode("choose-avatar");
  }

  function handleCommit() {
    if (!draftAvatar) return;
    onCommit({
      avatarId: draftAvatar.id,
      placement: previewRectToProjectPosition(draftRect),
    });
    setMode("details");
  }

  return (
    <div className="space-y-3">
      {mode === "details" ? (
        <button
          type="button"
          disabled={disabled}
          aria-label="Choose HeyGen avatar"
          onClick={openChooser}
          className={cn(
            "flex w-full items-center gap-3 rounded-md border bg-background p-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-ring",
            disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/70"
          )}
        >
          <AvatarPreview avatar={selectedAvatar} />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">
              {selectedAvatar?.name ?? "Choose a HeyGen avatar"}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {selectedAvatar ? getAvatarMetadataLabel(selectedAvatar) : "Completed private digital twin looks"}
            </span>
          </span>
          <span className="text-xs font-medium text-primary">
            {selectedAvatar ? "Change" : "Browse"}
          </span>
        </button>
      ) : null}

      {avatarsQuery.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading your HeyGen avatar looks
        </p>
      ) : null}
      {avatarsQuery.error ? (
        <p className="text-xs text-destructive">{avatarsQuery.error.message}</p>
      ) : null}
      {!avatarsQuery.isLoading && !avatarsQuery.error && avatars.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No completed private HeyGen digital twin avatar looks were found for this account.
        </p>
      ) : null}

      {mode === "choose-avatar" ? (
        <AvatarBrowser
          avatars={avatars}
          selectedAvatarId={draftAvatar?.id ?? ""}
          disabled={disabled}
          onSelect={(avatar) => {
            setDraftAvatarId(avatar.id);
            setMode("position-avatar");
          }}
          onBack={() => setMode("details")}
        />
      ) : null}

      {mode === "position-avatar" && draftAvatar ? (
        <AvatarPositioner
          avatar={draftAvatar}
          rect={draftRect}
          disabled={disabled}
          onRectChange={setDraftRect}
          onBack={() => setMode("choose-avatar")}
          onCancel={() => setMode("details")}
          onCommit={handleCommit}
        />
      ) : null}
    </div>
  );
}

function AvatarBrowser({
  avatars,
  selectedAvatarId,
  disabled,
  onSelect,
  onBack,
}: {
  avatars: HeyGenAvatarLook[];
  selectedAvatarId: string;
  disabled: boolean;
  onSelect: (avatar: HeyGenAvatarLook) => void;
  onBack: () => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3" aria-label="HeyGen avatar browser">
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">Choose avatar</p>
        <p className="text-xs text-muted-foreground">Select a completed private digital twin look.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {avatars.map((avatar) => {
          const selected = avatar.id === selectedAvatarId;
          return (
            <button
              key={avatar.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(avatar)}
              className={cn(
                "overflow-hidden rounded-md border bg-card text-left transition focus:outline-none focus:ring-2 focus:ring-ring",
                selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/70"
              )}
            >
              <div className="relative aspect-video bg-muted">
                {avatar.previewImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar.previewImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                {selected ? (
                  <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-medium text-foreground">{avatar.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {getAvatarMetadataLabel(avatar)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Back to details
        </Button>
      </div>
    </div>
  );
}

function AvatarPositioner({
  avatar,
  rect,
  disabled,
  onRectChange,
  onBack,
  onCancel,
  onCommit,
}: {
  avatar: HeyGenAvatarLook;
  rect: AvatarPreviewRect;
  disabled: boolean;
  onRectChange: (rect: AvatarPreviewRect) => void;
  onBack: () => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; rect: AvatarPreviewRect } | null>(null);
  const scale = rect.width / DEFAULT_PREVIEW_RECT.width;

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, rect };
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onRectChange({
      ...drag.rect,
      left: drag.rect.left + event.clientX - drag.startX,
      top: drag.rect.top + event.clientY - drag.startY,
    });
  }

  function handlePointerEnd(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4" aria-label="HeyGen avatar positioner">
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">Position avatar</p>
        <p className="text-xs text-muted-foreground">
          Drag and scale {avatar.name}. The avatar may extend outside the frame for cropping.
        </p>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div
          className="relative mx-auto overflow-hidden rounded-lg border bg-black"
          style={{ width: POSITION_FRAME.width, height: POSITION_FRAME.height }}
          aria-label="9:16 avatar preview frame"
        >
          <button
            type="button"
            disabled={disabled}
            aria-label="Drag avatar position"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            className="absolute cursor-grab touch-none overflow-hidden rounded-md border border-white/40 bg-muted active:cursor-grabbing"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          >
            {avatar.previewImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar.previewImageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                <UserRound className="h-8 w-8" />
              </span>
            )}
          </button>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <label className="block text-sm font-medium text-foreground">
            Avatar scale
            <input
              aria-label="Avatar scale"
              type="range"
              min="0.5"
              max="1.8"
              step="0.05"
              value={scale}
              disabled={disabled}
              onChange={(event) => {
                const nextScale = Number(event.target.value);
                onRectChange({
                  ...rect,
                  width: Math.round(DEFAULT_PREVIEW_RECT.width * nextScale),
                  height: Math.round(DEFAULT_PREVIEW_RECT.height * nextScale),
                });
              }}
              className="mt-2 w-full"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Stored offsets: {JSON.stringify(previewRectToProjectPosition(rect).offsets)}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onBack}>Back</Button>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="button" size="sm" onClick={onCommit}>Use avatar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AvatarPreview({ avatar }: { avatar: HeyGenAvatarLook | null }) {
  if (avatar?.previewImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatar.previewImageUrl} alt="" className="h-14 w-14 rounded-md border object-cover" />
    );
  }

  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-md border bg-muted text-muted-foreground">
      <UserRound className="h-6 w-6" />
    </span>
  );
}

function getAvatarMetadataLabel(avatar: HeyGenAvatarLook) {
  return [avatar.gender, ...avatar.tags, ...avatar.supportedApiEngines].filter(Boolean).join(" · ") ||
    "Digital twin avatar look";
}

function isAvatarPreviewRectSixteenByNine(rect: AvatarPreviewRect) {
  if (rect.height <= 0) return false;
  return Math.abs(rect.width / rect.height - AVATAR_PREVIEW_ASPECT_RATIO) < AVATAR_PREVIEW_ASPECT_RATIO_TOLERANCE;
}
