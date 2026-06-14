import { z } from "zod";
import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import {
  getAvatarSettingsColumnsForSave,
  getAvatarSettingsValidationError,
  OptionalHeyGenAvatarIdSchema,
  OptionalHeyGenAvatarProjectPositionSchema,
} from "@/lib/tours/avatar-project-settings";
import {
  DEFAULT_TOUR_PROJECT_TYPE,
  TOUR_PROJECT_TYPES,
  type TourProjectType,
} from "@/lib/tours/project-types";
import {
  getMissingProviderKeysForTourType,
  getTourTypeAvailabilityMessage,
} from "@/lib/tours/tour-type-availability";
import { getProfileApiKeyStatusMap } from "@/lib/user-api-keys/server";
import { getSlotState } from "@/lib/profiles/server";

export const dynamic = "force-dynamic";

const OptionalElevenLabsVoiceIdSchema = z
  .preprocess((value) => (value === null ? "" : value), z.string().trim().max(120, "Voice ID is too long").optional())
  .transform((value) => (value ? value : null));

const CreateTourProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120, "Project name is too long"),
  propertyAddress: z.string().trim().min(1, "Property address is required").max(240, "Property address is too long"),
  listingUrl: z
    .string()
    .trim()
    .max(500, "Listing URL is too long")
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(z.string().url("Listing URL must be a valid URL").nullable()),
  tourType: z.enum(TOUR_PROJECT_TYPES).default(DEFAULT_TOUR_PROJECT_TYPE),
  elevenLabsVoiceId: OptionalElevenLabsVoiceIdSchema,
  heyGenAvatarId: OptionalHeyGenAvatarIdSchema,
  heyGenAvatarPlacement: OptionalHeyGenAvatarProjectPositionSchema,
});

async function getTourTypeAvailabilityError(
  userId: string,
  tourType: TourProjectType
): Promise<string | null> {
  if (tourType === "tour_video") return null;

  // Keys are scoped to the active profile. No profile → treat as no
  // keys configured (caller will surface the "set up a profile" path
  // through the upstream gate).
  const slot = await getSlotState(userId).catch(() => null);
  const apiKeyStatus = slot?.active_profile_id
    ? await getProfileApiKeyStatusMap(slot.active_profile_id, ["elevenlabs", "heygen"])
    : {};

  if (getMissingProviderKeysForTourType(tourType, apiKeyStatus).length > 0) {
    return getTourTypeAvailabilityMessage(tourType, "creating");
  }

  return null;
}

export async function GET() {
  const access = await requireToursAccess();
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const { data: projects, error } = await access.supabase
    .from("tours_projects")
    .select("id, name, property_address, listing_url, tour_type, status, created_at, updated_at")
    .eq("user_id", access.user.id)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Could not load tour projects." }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return Response.json({ projects: [] });
  }

  const projectIds = projects.map((project) => project.id);
  const { data: scenes } = await access.supabase
    .from("tour_scenes")
    .select("id, project_id, sort_order")
    .in("project_id", projectIds)
    .order("sort_order", { ascending: true });

  const firstSceneByProject = new Map<string, string>();
  for (const scene of scenes ?? []) {
    if (!firstSceneByProject.has(scene.project_id)) {
      firstSceneByProject.set(scene.project_id, scene.id);
    }
  }

  const firstSceneIds = [...firstSceneByProject.values()];
  const { data: sourcePhotos } = firstSceneIds.length
    ? await access.supabase
        .from("tour_scene_source_photos")
        .select("scene_id, storage_path")
        .in("scene_id", firstSceneIds)
        .order("priority", { ascending: true })
    : { data: [] };

  const firstPhotoByScene = new Map<string, string>();
  for (const photo of sourcePhotos ?? []) {
    if (!firstPhotoByScene.has(photo.scene_id)) {
      firstPhotoByScene.set(photo.scene_id, photo.storage_path);
    }
  }

  const coverPhotoByProject = new Map<string, string>();
  await Promise.all(
    projects.map(async (project) => {
      const firstSceneId = firstSceneByProject.get(project.id);
      const storagePath = firstSceneId ? firstPhotoByScene.get(firstSceneId) : null;
      if (!storagePath) {
        return;
      }

      const { data: signedPhoto } = await access.supabase.storage
        .from("tours-listing-media")
        .createSignedUrl(storagePath, 60 * 60);
      if (signedPhoto?.signedUrl) {
        coverPhotoByProject.set(project.id, signedPhoto.signedUrl);
      }
    })
  );

  return Response.json({
    projects: projects.map((project) => ({
      ...project,
      cover_photo_preview_url: coverPhotoByProject.get(project.id) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const access = await requireToursAccess();
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateTourProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Enter valid tour project details." },
      { status: 400 }
    );
  }

  const tourTypeAvailabilityError = await getTourTypeAvailabilityError(
    access.user.id,
    parsed.data.tourType
  );
  if (tourTypeAvailabilityError) {
    return Response.json({ error: tourTypeAvailabilityError }, { status: 422 });
  }

  const requiredSettingsError = getAvatarSettingsValidationError({
    tourType: parsed.data.tourType,
    elevenLabsVoiceId: parsed.data.elevenLabsVoiceId,
    heyGenAvatarId: parsed.data.heyGenAvatarId,
    heyGenAvatarPlacement: parsed.data.heyGenAvatarPlacement,
  });
  if (requiredSettingsError) {
    return Response.json({ error: requiredSettingsError }, { status: 422 });
  }

  // Pin the project to the user's currently active platform_profile so
  // render code can look up the right (per-profile) ElevenLabs/HeyGen
  // keys. Null is tolerated for users who somehow create a project
  // before setting up a profile — render-time fallback handles it.
  const { data: profileRow } = await access.supabase
    .from("profiles")
    .select("active_profile_id")
    .eq("id", access.user.id)
    .maybeSingle();

  const avatarSettingsColumns = getAvatarSettingsColumnsForSave({
    tourType: parsed.data.tourType,
    heyGenAvatarId: parsed.data.heyGenAvatarId,
    heyGenAvatarPlacement: parsed.data.heyGenAvatarPlacement,
  });

  const { data, error } = await access.supabase
    .from("tours_projects")
    .insert({
      user_id: access.user.id,
      profile_id: profileRow?.active_profile_id ?? null,
      name: parsed.data.name,
      property_address: parsed.data.propertyAddress,
      listing_url: parsed.data.listingUrl,
      tour_type: parsed.data.tourType,
      elevenlabs_voice_id: parsed.data.elevenLabsVoiceId,
      ...avatarSettingsColumns,
    })
    .select("id")
    .single();

  if (error || !data) {
    return Response.json(
      { error: "Could not create the tour project. Please try again." },
      { status: 500 }
    );
  }

  return Response.json({ projectId: data.id }, { status: 201 });
}
