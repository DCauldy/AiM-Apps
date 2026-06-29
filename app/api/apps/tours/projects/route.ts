import { z } from "zod";
import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import {
  OptionalHeyGenAvatarIdSchema,
  OptionalHeyGenAvatarProjectPositionSchema,
} from "@/lib/tours/avatar-settings/avatar-project-settings";
import {
  DEFAULT_TOUR_PROJECT_TYPE,
  TOUR_PROJECT_TYPES,
} from "@/lib/tours/projects/project-types";
import type {
  CreateTourProjectResponse,
  OpenTourProjectsResponse,
} from "@/lib/tours/projects/project-api-contracts";
import {
  getRequiredSettingsValidationError,
  getTourProjectSettingsColumnsForSave,
} from "@/lib/tours/projects/project-configuration";
import { OptionalElevenLabsVoiceIdSchema } from "@/lib/tours/projects/project-configuration.schema";
import { getTourTypeAvailabilityErrorForUser } from "@/lib/tours/tour-type-availability.server";

export const dynamic = "force-dynamic";

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
    const payload = { projects: [] } satisfies OpenTourProjectsResponse;

    return Response.json(payload);
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

  const payload = {
    projects: projects.map((project) => ({
      ...project,
      cover_photo_preview_url: coverPhotoByProject.get(project.id) ?? null,
    })),
  } satisfies OpenTourProjectsResponse;

  return Response.json(payload);
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

  const tourTypeAvailabilityError = await getTourTypeAvailabilityErrorForUser({
    userId: access.user.id,
    tourType: parsed.data.tourType,
    action: "creating",
  });
  if (tourTypeAvailabilityError) {
    return Response.json({ error: tourTypeAvailabilityError }, { status: 422 });
  }

  const requiredSettingsError = getRequiredSettingsValidationError({
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

  const projectSettingsColumns = getTourProjectSettingsColumnsForSave({
    tourType: parsed.data.tourType,
    elevenLabsVoiceId: parsed.data.elevenLabsVoiceId,
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
      ...projectSettingsColumns,
    })
    .select("id")
    .single();

  if (error || !data) {
    return Response.json(
      { error: "Could not create the tour project. Please try again." },
      { status: 500 }
    );
  }

  const payload = { projectId: data.id } satisfies CreateTourProjectResponse;

  return Response.json(payload, { status: 201 });
}
