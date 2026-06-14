import "server-only";

import { getFeatureFlag } from "@/lib/admin-config.server";
import { createClient } from "@/lib/supabase/server";
import { evaluateToursAccess, type ToursAccessProject } from "./access.core";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ToursUser = NonNullable<Awaited<ReturnType<SupabaseClient["auth"]["getUser"]>>["data"]["user"]>;

type RequireToursAccessInput = {
  projectId?: string;
  requireOpenProject?: boolean;
};

type RequireToursAccessAllowed = {
  ok: true;
  status: 200;
  supabase: SupabaseClient;
  user: ToursUser;
  project: ToursAccessProject | null;
};

type RequireToursAccessDenied = {
  ok: false;
  status: 401 | 403 | 404 | 409 | 500;
  error: string;
  supabase: SupabaseClient;
  user: ToursUser | null;
  project: ToursAccessProject | null;
};

export type RequireToursAccessResult = RequireToursAccessAllowed | RequireToursAccessDenied;

export async function requireToursAccess(
  input: RequireToursAccessInput = {}
): Promise<RequireToursAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isToursEnabled = await getFeatureFlag("TOURS");

  let project: ToursAccessProject | null = null;
  let projectError = false;

  if (user && input.projectId) {
    const { data, error } = await supabase
      .from("tours_projects")
      .select("id, name, status")
      .eq("id", input.projectId)
      .eq("user_id", user.id)
      .maybeSingle<ToursAccessProject>();

    project = data ?? null;
    projectError = Boolean(error);
  }

  const access = evaluateToursAccess({
    user,
    isToursEnabled,
    project,
    projectError,
    requireProject: Boolean(input.projectId),
    requireOpenProject: Boolean(input.requireOpenProject),
  });

  if (!access.ok) {
    return {
      ...access,
      supabase,
      user,
      project,
    };
  }

  return {
    ok: true,
    status: 200,
    supabase,
    user: user as ToursUser,
    project,
  };
}

export function toursAccessErrorResponse(access: RequireToursAccessDenied): Response {
  return Response.json({ error: access.error }, { status: access.status });
}
