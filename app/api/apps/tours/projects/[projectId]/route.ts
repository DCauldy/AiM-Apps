import { z } from "zod";
import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import {
  OptionalHeyGenAvatarIdSchema,
  OptionalHeyGenAvatarProjectPositionSchema,
  type HeyGenAvatarProjectPosition,
} from "@/lib/tours/avatar-project-settings";
import { TOUR_PROJECT_TYPES, type TourProjectType } from "@/lib/tours/project-types";
import {
  getChangedTourProjectSettingsForUpdate,
  getRequiredSettingsValidationError,
} from "@/lib/tours/project-configuration";
import type {
  TourProjectWorkspaceResponse,
  UpdatedTourProject,
  UpdateTourProjectResponse,
} from "@/lib/tours/project-api-contracts";
import { OptionalElevenLabsVoiceIdSchema } from "@/lib/tours/project-configuration.schema";
import { getTourTypeAvailabilityErrorForUser } from "@/lib/tours/tour-type-availability.server";
import { getTourProjectWorkspaceViewModel } from "@/lib/tours/workspace";

export const dynamic = "force-dynamic";

const UpdateTourProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120, "Project name is too long"),
  propertyAddress: z.string().trim().min(1, "Property address is required").max(240, "Property address is too long"),
  listingUrl: z
    .string()
    .trim()
    .max(500, "Listing URL is too long")
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(z.string().url("Listing URL must be a valid URL").nullable()),
  tourType: z.enum(TOUR_PROJECT_TYPES).optional(),
  elevenLabsVoiceId: OptionalElevenLabsVoiceIdSchema,
  heyGenAvatarId: OptionalHeyGenAvatarIdSchema,
  heyGenAvatarPlacement: OptionalHeyGenAvatarProjectPositionSchema,
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const workspace = await getTourProjectWorkspaceViewModel(projectId);

  if (!workspace) {
    return Response.json(
      { error: "Tour project was not found or cannot be loaded." },
      { status: 404 }
    );
  }

  const payload = { workspace } satisfies TourProjectWorkspaceResponse;

  return Response.json(payload);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateTourProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Enter valid tour project details." },
      { status: 400 }
    );
  }

  const { data: currentProject, error: currentProjectError } = await access.supabase
    .from("tours_projects")
    .select("tour_type, elevenlabs_voice_id, heygen_avatar_id, heygen_avatar_placement")
    .eq("id", projectId)
    .eq("user_id", access.user.id)
    .eq("status", "open")
    .maybeSingle<{
      tour_type: TourProjectType;
      elevenlabs_voice_id: string | null;
      heygen_avatar_id: string | null;
      heygen_avatar_placement: HeyGenAvatarProjectPosition | null;
    }>();

  if (currentProjectError) {
    return Response.json({ error: "Could not update the tour project." }, { status: 500 });
  }

  if (!currentProject) {
    return Response.json(
      { error: "Tour project was not found or cannot be updated." },
      { status: 404 }
    );
  }

  const effectiveTourType = parsed.data.tourType ?? currentProject.tour_type;
  if (parsed.data.tourType) {
    const tourTypeAvailabilityError = await getTourTypeAvailabilityErrorForUser({
      userId: access.user.id,
      tourType: parsed.data.tourType,
      action: "choosing",
    });
    if (tourTypeAvailabilityError) {
      return Response.json({ error: tourTypeAvailabilityError }, { status: 422 });
    }
  }

  const settingsUpdates = {
    ...(body && typeof body === "object" && "elevenLabsVoiceId" in body
      ? { elevenLabsVoiceId: parsed.data.elevenLabsVoiceId }
      : {}),
    ...(body && typeof body === "object" && "heyGenAvatarId" in body
      ? { heyGenAvatarId: parsed.data.heyGenAvatarId }
      : {}),
    ...(body && typeof body === "object" && "heyGenAvatarPlacement" in body
      ? { heyGenAvatarPlacement: parsed.data.heyGenAvatarPlacement }
      : {}),
  };
  const nextSettings = {
    elevenLabsVoiceId:
      settingsUpdates.elevenLabsVoiceId !== undefined
        ? settingsUpdates.elevenLabsVoiceId
        : currentProject.elevenlabs_voice_id,
    heyGenAvatarId:
      settingsUpdates.heyGenAvatarId !== undefined
        ? settingsUpdates.heyGenAvatarId
        : currentProject.heygen_avatar_id,
    heyGenAvatarPlacement:
      settingsUpdates.heyGenAvatarPlacement !== undefined
        ? settingsUpdates.heyGenAvatarPlacement
        : currentProject.heygen_avatar_placement,
  };

  const requiredSettingsError = getRequiredSettingsValidationError({
    tourType: effectiveTourType,
    ...nextSettings,
  });
  if (requiredSettingsError) {
    return Response.json({ error: requiredSettingsError }, { status: 422 });
  }

  const projectSettingsColumns = getChangedTourProjectSettingsForUpdate({
    tourType: effectiveTourType,
    currentSettings: {
      elevenLabsVoiceId: currentProject.elevenlabs_voice_id,
      heyGenAvatarId: currentProject.heygen_avatar_id,
      heyGenAvatarPlacement: currentProject.heygen_avatar_placement,
    },
    updates: settingsUpdates,
  });

  const { data, error } = await access.supabase
    .from("tours_projects")
    .update({
      name: parsed.data.name,
      property_address: parsed.data.propertyAddress,
      listing_url: parsed.data.listingUrl,
      ...(parsed.data.tourType ? { tour_type: parsed.data.tourType } : {}),
      ...projectSettingsColumns,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("user_id", access.user.id)
    .eq("status", "open")
    .select("id, name, property_address, listing_url, tour_type, elevenlabs_voice_id, heygen_avatar_id, heygen_avatar_placement, status, updated_at")
    .maybeSingle<UpdatedTourProject>();

  if (error) {
    return Response.json({ error: "Could not update the tour project." }, { status: 500 });
  }

  if (!data) {
    return Response.json(
      { error: "Tour project was not found or cannot be updated." },
      { status: 404 }
    );
  }

  const payload = { project: data } satisfies UpdateTourProjectResponse;

  return Response.json(payload);
}
