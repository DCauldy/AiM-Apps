import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Resolve which platform_profile a tour render should use for key lookup.
 *
 * Prefers the project's own profile_id (set at create time from the
 * user's active profile). Falls back to the user's default profile if
 * the project predates the profile_id column or was created before a
 * profile existed — that keeps existing tour projects renderable.
 *
 * Returns null only if the user has zero platform_profiles, in which
 * case render must fail (no keys to look up anyway).
 */
export async function resolveProfileIdForRender(
  projectId: string,
  userId: string
): Promise<string | null> {
  const service = createServiceRoleClient();

  // 1. Project-pinned profile (preferred)
  const { data: project } = await service
    .from("tours_projects")
    .select("profile_id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (project?.profile_id) return project.profile_id;

  // 2. Fallback: user's default profile, else any active one
  const { data: profile } = await service
    .from("platform_profiles")
    .select("id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return profile?.id ?? null;
}
