import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";

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
});

async function requireToursAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, error: "Sign in to access tour projects.", status: 401 } as const;
  }

  const isEnabled = await getFeatureFlag("TOURS");
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (!isEnabled || subscriptionTier !== "pro") {
    return { supabase, user, error: "Tours is not available for this account.", status: 403 } as const;
  }

  return { supabase, user, error: null, status: 200 } as const;
}

export async function GET() {
  const access = await requireToursAccess();
  if (access.error) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const { data: projects, error } = await access.supabase
    .from("tours_projects")
    .select("id, name, property_address, listing_url, status, created_at, updated_at")
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
  if (access.error) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateTourProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Enter valid tour project details." },
      { status: 400 }
    );
  }

  const { data, error } = await access.supabase
    .from("tours_projects")
    .insert({
      user_id: access.user.id,
      name: parsed.data.name,
      property_address: parsed.data.propertyAddress,
      listing_url: parsed.data.listingUrl,
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
