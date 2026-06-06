import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { getListingMediaAcknowledgementForProject } from "@/lib/tours/listing-media-authorization";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sceneId: string }> }
) {
  const { projectId, sceneId } = await params;
  const access = await requireOpenTourProjectAccess(projectId);
  if (access.error) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const acknowledgement = await getListingMediaAcknowledgementForProject(projectId);
  if (!acknowledgement) {
    return Response.json(
      { error: "Acknowledge listing-media authorization before submitting images for this Tour Project." },
      { status: 403 }
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ error: "Submit a listing photo." }, { status: 400 });
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

  const { data: lastPhoto, error: lastPhotoError } = await access.supabase
    .from("tour_scene_source_photos")
    .select("priority")
    .eq("project_id", projectId)
    .eq("scene_id", sceneId)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle<{ priority: number }>();

  if (lastPhotoError) {
    return Response.json({ error: "Could not load listing photos for this TourScene." }, { status: 500 });
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
    return Response.json({ error: "Could not upload the listing photo." }, { status: 500 });
  }

  const { data: createdPhoto, error: createPhotoError } = await access.supabase
    .from("tour_scene_source_photos")
    .insert({
      project_id: projectId,
      scene_id: sceneId,
      storage_path: storagePath,
      file_name: file.name,
      content_type: file.type,
      byte_size: file.size,
      width: null,
      height: null,
      priority: (lastPhoto?.priority ?? -1) + 1,
    })
    .select(SOURCE_PHOTO_SELECT)
    .single();

  if (createPhotoError || !createdPhoto) {
    await access.supabase.storage.from(LISTING_MEDIA_BUCKET).remove([storagePath]);
    return Response.json({ error: "Could not add the listing photo." }, { status: 500 });
  }

  await access.supabase
    .from("tour_scenes")
    .update({ updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("id", sceneId);

  return Response.json({ scene, sourcePhoto: createdPhoto }, { status: 201 });
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

  const acknowledgement = await getListingMediaAcknowledgementForProject(projectId);
  if (!acknowledgement) {
    return Response.json(
      { error: "Acknowledge listing-media authorization before submitting images for this Tour Project." },
      { status: 403 }
    );
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sceneId: string }> }
) {
  const { projectId, sceneId } = await params;
  const access = await requireOpenTourProjectAccess(projectId);
  if (access.error) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const acknowledgement = await getListingMediaAcknowledgementForProject(projectId);
  if (!acknowledgement) {
    return Response.json(
      { error: "Acknowledge listing-media authorization before removing images from this Tour Project." },
      { status: 403 }
    );
  }

  const { data: sourcePhotos, error: sourcePhotosError } = await access.supabase
    .from("tour_scene_source_photos")
    .select(SOURCE_PHOTO_SELECT)
    .eq("project_id", projectId)
    .eq("scene_id", sceneId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (sourcePhotosError) {
    return Response.json({ error: "Could not load listing photos for this TourScene." }, { status: 500 });
  }

  if (!sourcePhotos || sourcePhotos.length === 0) {
    return Response.json({ error: "TourScene listing photo was not found." }, { status: 404 });
  }

  if (sourcePhotos.length === 1) {
    return Response.json({ error: "TourScene needs at least one listing photo." }, { status: 409 });
  }

  const [photoToRemove, ...remainingPhotos] = sourcePhotos;
  const serviceSupabase = createServiceRoleClient();
  const { error: deletePhotoError } = await serviceSupabase
    .from("tour_scene_source_photos")
    .delete()
    .eq("id", photoToRemove.id)
    .eq("project_id", projectId)
    .eq("scene_id", sceneId);

  if (deletePhotoError) {
    return Response.json({ error: "Could not remove the listing photo." }, { status: 500 });
  }

  for (const [priority, photo] of remainingPhotos.entries()) {
    if (photo.priority === priority) {
      continue;
    }

    const { error: priorityError } = await serviceSupabase
      .from("tour_scene_source_photos")
      .update({ priority })
      .eq("id", photo.id)
      .eq("project_id", projectId)
      .eq("scene_id", sceneId);

    if (priorityError) {
      return Response.json({ error: "Could not update the remaining listing photo order." }, { status: 500 });
    }
  }

  await access.supabase
    .from("tour_scenes")
    .update({ updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("id", sceneId);
  await access.supabase.storage.from(LISTING_MEDIA_BUCKET).remove([photoToRemove.storage_path]);

  return Response.json({ removedPhotoId: photoToRemove.id });
}
