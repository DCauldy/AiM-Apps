import { createClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";

export const dynamic = "force-dynamic";

async function requireToursAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, error: "Sign in to archive tour projects.", status: 401 } as const;
  }

  const isEnabled = await getFeatureFlag("TOURS");
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (!isEnabled || subscriptionTier !== "pro") {
    return { supabase, user, error: "Tours is not available for this account.", status: 403 } as const;
  }

  return { supabase, user, error: null, status: 200 } as const;
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const access = await requireToursAccess();
  if (access.error) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const { projectId } = await params;
  const { data, error } = await access.supabase
    .from("tours_projects")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("user_id", access.user.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Could not archive the tour project." }, { status: 500 });
  }

  if (!data) {
    return Response.json(
      { error: "Tour project was not found or cannot be archived." },
      { status: 404 }
    );
  }

  return Response.json({ projectId: data.id, status: "archived" });
}
