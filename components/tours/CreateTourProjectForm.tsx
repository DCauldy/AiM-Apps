"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic2, Plus, UserRound, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ElevenLabsVoiceSelector } from "@/components/tours/workspace/ElevenLabsVoiceSelector";
import { HeyGenAvatarSelector } from "@/components/tours/workspace/HeyGenAvatarSelector";
import type { HeyGenAvatarProjectPosition } from "@/components/tours/workspace/avatar-positioning";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DEFAULT_TOUR_PROJECT_TYPE,
  TOUR_PROJECT_TYPE_LABELS,
  type TourProjectType,
} from "@/lib/tours/projects/project-types";
import {
  getRequiredSettingsState,
  getTourProjectConfiguration,
  getTourProjectSettingsPayloadForCreate,
} from "@/lib/tours/projects/project-configuration";
import { isTourTypeAvailable } from "@/lib/tours/tour-type-availability";
import {
  createTourProject,
  tourQueryKeys,
  type CreateTourProjectInput,
} from "@/components/tours/tours-api-client";
import { cn } from "@/lib/utils";

const tourTypeOptions: Array<{
  value: TourProjectType;
  title: string;
  description: string;
  icon: typeof Video;
  isEnabled: (availability: TourTypeAvailability) => boolean;
  disabledReason: string;
  disabledDetails: string;
}> = [
  {
    value: "tour_video",
    title: TOUR_PROJECT_TYPE_LABELS.tour_video,
    description: "A visual property tour without avatar narration or voice over.",
    icon: Video,
    isEnabled: () => true,
    disabledReason: "",
    disabledDetails: "",
  },
  {
    value: "tour_video_voice_over",
    title: TOUR_PROJECT_TYPE_LABELS.tour_video_voice_over,
    description: "Add generated narration to the property tour video.",
    icon: Mic2,
    isEnabled: ({ canUseElevenLabs, canUseHeyGen }) =>
      isTourTypeAvailable("tour_video_voice_over", {
        elevenlabs: canUseElevenLabs,
        heygen: canUseHeyGen,
      }),
    disabledReason: "Requires an ElevenLabs API key.",
    disabledDetails:
      "Voice over tours will unlock when an active profile has an ElevenLabs API key.",
  },
  {
    value: "tour_video_avatar",
    title: TOUR_PROJECT_TYPE_LABELS.tour_video_avatar,
    description: "Present the tour with a generated on-screen video avatar.",
    icon: UserRound,
    isEnabled: ({ canUseElevenLabs, canUseHeyGen }) =>
      isTourTypeAvailable("tour_video_avatar", {
        elevenlabs: canUseElevenLabs,
        heygen: canUseHeyGen,
      }),
    disabledReason: "Requires ElevenLabs and HeyGen API keys.",
    disabledDetails:
      "Video avatar tours will unlock when an active profile has ElevenLabs and HeyGen API keys.",
  },
];

type TourTypeAvailability = {
  canUseElevenLabs: boolean;
  canUseHeyGen: boolean;
};

export function CreateTourProjectForm({
  canUseElevenLabs,
  canUseHeyGen,
}: TourTypeAvailability) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [tourType, setTourType] = useState<TourProjectType>(DEFAULT_TOUR_PROJECT_TYPE);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState("");
  const [heyGenAvatarId, setHeyGenAvatarId] = useState("");
  const [heyGenAvatarPlacement, setHeyGenAvatarPlacement] =
    useState<HeyGenAvatarProjectPosition | null>(null);
  const [hasAttemptedCreate, setHasAttemptedCreate] = useState(false);
  const projectConfiguration = getTourProjectConfiguration(tourType);
  const { isVoiceSelectionMissing, isAvatarSelectionMissing } = getRequiredSettingsState({
    tourType,
    elevenLabsVoiceId,
    heyGenAvatarId,
    heyGenAvatarPlacement,
  });

  const mutation = useMutation({
    mutationFn: createTourProject,
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: tourQueryKeys.openProjects() });
      router.push(`/apps/tours/projects/${projectId}`);
    },
  });

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Start property
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl sm:max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>Start a property</DialogTitle>
            <DialogClose onClose={() => setOpen(false)} />
          </DialogHeader>
          <DialogBody className="min-h-0">
            <form
              id="create-tour-project-form"
              onSubmit={(event) => {
                event.preventDefault();
                setHasAttemptedCreate(true);
                if (isVoiceSelectionMissing || isAvatarSelectionMissing) {
                  return;
                }
                mutation.mutate({
                  name,
                  propertyAddress,
                  listingUrl,
                  tourType,
                  ...getTourProjectSettingsPayloadForCreate({
                    tourType,
                    elevenLabsVoiceId,
                    heyGenAvatarId,
                    heyGenAvatarPlacement,
                  }),
                });
              }}
            >
              <p className="text-sm text-muted-foreground">
                Add the listing identity to start a lightweight workspace.
              </p>

              <div className="mt-5 grid gap-4">
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Project name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={120}
                    placeholder="123 Main Street Tour"
                    className="rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Property address
                  <input
                    value={propertyAddress}
                    onChange={(event) => setPropertyAddress(event.target.value)}
                    required
                    maxLength={240}
                    placeholder="123 Main Street, Austin, TX"
                    className="rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Listing URL <span className="font-normal text-muted-foreground">optional</span>
                  <input
                    value={listingUrl}
                    onChange={(event) => setListingUrl(event.target.value)}
                    maxLength={500}
                    placeholder="https://example.com/listing/123-main-street"
                    className="rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>

              <fieldset className="mt-5">
                <legend className="text-sm font-medium">Tour type</legend>
                <TooltipProvider delayDuration={150}>
                  <div className="mt-2 grid gap-3 md:grid-cols-3">
                    {tourTypeOptions.map((option) => {
                      const Icon = option.icon;
                      const enabled = option.isEnabled({ canUseElevenLabs, canUseHeyGen });
                      const selected = tourType === option.value;
                      const cardClassName = cn(
                        "min-h-[96px] rounded-md border bg-card p-4 text-left transition md:min-h-[148px]",
                        selected
                          ? "border-primary ring-2 ring-primary/35"
                          : "border-border",
                        enabled
                          ? "cursor-pointer hover:border-primary/70"
                          : "cursor-not-allowed opacity-70"
                      );

                      const cardContent = (
                        <>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">
                              {option.title}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {option.description}
                          </p>
                          {!enabled && (
                            <p className="mt-3 text-xs leading-5 text-muted-foreground">
                              {option.disabledReason}{" "}
                              <Link
                                href="/apps/profile/api-keys"
                                className="font-medium text-primary underline-offset-4 hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                Add API keys
                              </Link>
                            </p>
                          )}
                        </>
                      );

                      if (!enabled) {
                        return (
                          <Tooltip key={option.value}>
                            <TooltipTrigger asChild>
                              <div
                                aria-disabled="true"
                                aria-checked="false"
                                role="radio"
                                tabIndex={0}
                                className={cardClassName}
                              >
                                {cardContent}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {option.disabledDetails}
                            </TooltipContent>
                          </Tooltip>
                        );
                      }

                      return (
                        <label key={option.value} className={cardClassName}>
                          <input
                            type="radio"
                            name="tourType"
                            value={option.value}
                            checked={selected}
                            onChange={() => {
                              setTourType(option.value);
                              setHasAttemptedCreate(false);
                              const nextConfiguration = getTourProjectConfiguration(option.value);
                              if (!nextConfiguration.supportsVoiceSelection) {
                                setElevenLabsVoiceId("");
                              }
                              if (!nextConfiguration.supportsAvatarSettings) {
                                setHeyGenAvatarId("");
                                setHeyGenAvatarPlacement(null);
                              }
                            }}
                            className="sr-only"
                          />
                          {cardContent}
                        </label>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </fieldset>

              {projectConfiguration.supportsVoiceSelection ? (
                <div className="mt-5 text-sm font-medium text-foreground">
                  <span>ElevenLabs digital twin voice</span>
                  <div className="mt-2">
                    <ElevenLabsVoiceSelector
                      value={elevenLabsVoiceId}
                      disabled={mutation.isPending}
                      onChange={setElevenLabsVoiceId}
                    />
                  </div>
                  {hasAttemptedCreate && isVoiceSelectionMissing ? (
                    <p className="mt-1 text-xs text-destructive">
                      Select a digital twin voice before creating this project.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {projectConfiguration.supportsAvatarSettings ? (
                <div className="mt-5 text-sm font-medium text-foreground">
                  <span>HeyGen avatar look</span>
                  <div className="mt-2">
                    <HeyGenAvatarSelector
                      value={heyGenAvatarId}
                      placement={heyGenAvatarPlacement}
                      disabled={mutation.isPending}
                      onCommit={({ avatarId, placement }) => {
                        setHeyGenAvatarId(avatarId);
                        setHeyGenAvatarPlacement(placement);
                      }}
                    />
                  </div>
                  {hasAttemptedCreate && isAvatarSelectionMissing ? (
                    <p className="mt-1 text-xs text-destructive">
                      Select a HeyGen avatar before creating this project.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Avatar placement will be saved with this project.
                    </p>
                  )}
                </div>
              ) : null}

              {mutation.error && (
                <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {mutation.error.message}
                </p>
              )}
            </form>
          </DialogBody>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-tour-project-form"
              disabled={mutation.isPending}
            >
              <Plus className="h-4 w-4" />
              {mutation.isPending ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
