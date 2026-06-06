import { createClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { getListingMediaAcknowledgementForProject } from "@/lib/tours/listing-media-authorization";
import { createTourSceneFromAuthoritativePhoto } from "@/lib/tours/scenes";
import {
  LISTING_MEDIA_BUCKET,
  getListingMediaStoragePath,
  validateListingMediaFile,
} from "@/lib/tours/listing-media-upload";

export const dynamic = "force-dynamic";

async function requireToursAccess(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, project: null, error: "Sign in to create TourScenes.", status: 401 } as const;
  }

  const isEnabled = await getFeatureFlag("TOURS");
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (!isEnabled || subscriptionTier !== "pro") {
    return { supabase, user, project: null, error: "Tours is not available for this account.", status: 403 } as const;
  }

  const { data: project, error: projectError } = await supabase
    .from("tours_projects")
    .select("id, status")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; status: "open" | "archived" }>();

  if (projectError) {
    return { supabase, user, project: null, error: "Could not verify Tour Project access.", status: 500 } as const;
  }

  if (!project) {
    return { supabase, user, project: null, error: "Tour Project was not found.", status: 404 } as const;
  }

  if (project.status !== "open") {
    return { supabase, user, project, error: "Archived Tour Projects cannot create new TourScenes.", status: 409 } as const;
  }

  return { supabase, user, project, error: null, status: 200 } as const;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess(projectId);
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
    return Response.json({ error: "Submit a listing photo and TourScene title." }, { status: 400 });
  }

  const title = String(formData.get("title") ?? "").trim();
  const fileValidation = validateListingMediaFile(formData.get("photo"));

  if (!title) {
    return Response.json({ error: "Enter a TourScene title." }, { status: 400 });
  }

  if (!fileValidation.ok) {
    return Response.json({ error: fileValidation.error }, { status: fileValidation.status });
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
    return Response.json({ error: "Could not upload the listing photo. Please try again." }, { status: 500 });
  }

  const result = await createTourSceneFromAuthoritativePhoto({
    projectId,
    title,
    sourcePhoto: {
      storagePath,
      fileName: file.name,
      contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
      byteSize: file.size,
    },
  });

  if (!result.ok) {
    await access.supabase.storage.from(LISTING_MEDIA_BUCKET).remove([storagePath]);
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ scene: result.scene }, { status: 201 });
}
