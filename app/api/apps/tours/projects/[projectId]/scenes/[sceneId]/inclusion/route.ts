import { createClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { toggleTourSceneInclusion } from "@/lib/tours/scenes";
import { validateTourSceneReorderProjectAccess } from "@/lib/tours/scenes.core";

export const dynamic = "force-dynamic";

async function requireOpenTourProjectAccess(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to update TourScenes.", status: 401 } as const;
  }

  const isEnabled = await getFeatureFlag("TOURS");
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (!isEnabled || subscriptionTier !== "pro") {
    return { error: "Tours is not available for this account.", status: 403 } as const;
  }

  const { data: project, error: projectError } = await supabase
    .from("tours_projects")
    .select("id, status")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; status: "open" | "archived" }>();

  if (projectError) {
    return { error: "Could not verify Tour Project access.", status: 500 } as const;
  }

  const projectAccess = validateTourSceneReorderProjectAccess(project);
  if (!projectAccess.ok) {
    return { error: projectAccess.error, status: projectAccess.status } as const;
  }

  return { error: null, status: 200 } as const;
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

  const body = await request.json().catch(() => null);
  if (typeof body?.included !== "boolean") {
    return Response.json({ error: "Send whether this TourScene should be included." }, { status: 400 });
  }

  const result = await toggleTourSceneInclusion({ projectId, sceneId, included: body.included });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ scene: result.scene });
}
