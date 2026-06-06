import { createClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import {
  LISTING_MEDIA_BUCKET,
  getListingMediaStoragePath,
  validateListingMediaFile,
} from "@/lib/tours/listing-media-upload";

export const dynamic = "force-dynamic";

const SCENE_SELECT = "id, project_id, title, sort_order, included, camera_motion, created_at, updated_at";
const SOURCE_PHOTO_SELECT =
  "id, project_id, scene_id, storage_path, file_name, content_type, byte_size, width, height, priority, created_at";

async function requireOpenTourProjectAccess(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, error: "Sign in to update TourScenes.", status: 401 } as const;
  }

  const isEnabled = await getFeatureFlag("TOURS");
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (!isEnabled || subscriptionTier !== "pro") {
    return { supabase, user, error: "Tours is not available for this account.", status: 403 } as const;
  }

  const { data: project, error: projectError } = await supabase
    .from("tours_projects")
    .select("id, status")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; status: "open" | "archived" }>();

  if (projectError) {
    return { supabase, user, error: "Could not verify Tour Project access.", status: 500 } as const;
  }

  if (!project) {
    return { supabase, user, error: "Tour Project was not found.", status: 404 } as const;
  }

  if (project.status !== "open") {
    return { supabase, user, error: "Archived Tour Projects cannot update TourScenes.", status: 409 } as const;
  }

  return { supabase, user, error: null, status: 200 } as const;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sceneId: string }> }
) {
  const { projectId, sceneId } = await params;
  const access = await requireOpenTourProjectAccess(projectId);
  if (access.error) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ error: "Submit a replacement listing photo." }, { status: 400 });
  }

  const fileValidation = validateListingMediaFile(formData.get("photo"));
  if (!fileValidation.ok) {
    return Response.json({ error: fileValidation.error }, { status: fileValidation.status });
  }

  const { data: scene, error: sceneError } = await access.supabase
    .from("tour_scenes")
    .select(SCENE_SELECT)
    .eq("project_id", projectId)
    .eq("id", sceneId)
    .maybeSingle();

  if (sceneError) {
    return Response.json({ error: "Could not load the TourScene." }, { status: 500 });
  }

  if (!scene) {
    return Response.json({ error: "TourScene was not found." }, { status: 404 });
  }

  const { data: currentPhoto, error: currentPhotoError } = await access.supabase
    .from("tour_scene_source_photos")
    .select(SOURCE_PHOTO_SELECT)
    .eq("project_id", projectId)
    .eq("scene_id", sceneId)
    .eq("priority", 0)
    .maybeSingle<{ id: string; storage_path: string }>();

  if (currentPhotoError) {
    return Response.json({ error: "Could not load the authoritative listing photo." }, { status: 500 });
  }

  if (!currentPhoto) {
    return Response.json({ error: "TourScene needs an authoritative listing photo before it can be replaced." }, { status: 404 });
  }

  const file = fileValidation.file;
  const storagePath = getListingMediaStoragePath({
    userId: access.user.id,
    projectId,
    fileName: file.name,
  });
  const { error: uploadError } = await access.supabase.storage
    .from(LISTING_MEDIA_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ error: "Could not upload the replacement listing photo." }, { status: 500 });
  }

  const { data: updatedPhoto, error: updatePhotoError } = await access.supabase
    .from("tour_scene_source_photos")
    .update({
      storage_path: storagePath,
      file_name: file.name,
      content_type: file.type,
      byte_size: file.size,
      width: null,
      height: null,
    })
    .eq("id", currentPhoto.id)
    .eq("project_id", projectId)
    .eq("scene_id", sceneId)
    .select(SOURCE_PHOTO_SELECT)
    .maybeSingle();

  if (updatePhotoError || !updatedPhoto) {
    await access.supabase.storage.from(LISTING_MEDIA_BUCKET).remove([storagePath]);
    return Response.json({ error: "Could not replace the authoritative listing photo." }, { status: 500 });
  }

  await access.supabase
    .from("tour_scenes")
    .update({ updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("id", sceneId);
  await access.supabase.storage.from(LISTING_MEDIA_BUCKET).remove([currentPhoto.storage_path]);

  return Response.json({ scene, authoritativePhoto: updatedPhoto });
}
