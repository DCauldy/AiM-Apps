import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  pickProfileFields,
  listUserProfiles,
  canCreateProfile,
  setDefaultProfile,
  setActiveProfile,
} from "@/lib/profiles/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/profiles — list the current user's profiles, default first, then active, then archived. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const profiles = await listUserProfiles(user.id);
    return Response.json({ profiles });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list profiles";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/profiles — create a new profile.
 *
 * Body: PlatformProfileInsert (must include display_name).
 * Slot-gated: rejects if the user has no remaining slots.
 *
 * If this is the user's first profile, marks it default AND active.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const payload = pickProfileFields(body);

  if (!payload.display_name || typeof payload.display_name !== "string") {
    return Response.json({ error: "display_name is required" }, { status: 400 });
  }

  const capacity = await canCreateProfile(user.id);
  if (!capacity.allowed) {
    return Response.json(
      { error: capacity.reason, slotCount: capacity.slotCount, activeCount: capacity.activeCount },
      { status: 402 }
    );
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("platform_profiles")
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // First-profile bootstrap: mark default + active
  if (capacity.activeCount === 0) {
    await setDefaultProfile(user.id, data.id);
    await setActiveProfile(user.id, data.id);
  }

  return Response.json({ profile: data });
}
