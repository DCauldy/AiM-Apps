import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { pickProfileFields, getSlotState, setActiveProfile } from "@/lib/profiles/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/profiles/[id] — fetch one profile. RLS-enforced. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("platform_profiles")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ profile: data });
}

/** PATCH /api/profiles/[id] — partial update. Whitelisted fields only. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const payload = pickProfileFields(body);
  if (Object.keys(payload).length === 0) {
    return Response.json({ error: "No editable fields in body" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("platform_profiles")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ profile: data });
}

/**
 * DELETE /api/profiles/[id] — hard delete. Requires ?confirm=true query param.
 *
 * Cascades to all app-scoped tables via ON DELETE CASCADE on profile_id FKs.
 * If the deleted profile was the user's active one, active_profile_id is
 * automatically set to null by the FK ON DELETE SET NULL on profiles.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const confirm = new URL(req.url).searchParams.get("confirm");
  if (confirm !== "true") {
    return Response.json(
      { error: "Hard delete requires ?confirm=true. Did you mean to archive instead?" },
      { status: 400 }
    );
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("platform_profiles")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // If we just deleted the user's active profile, pick the next default-or-oldest as the new active.
  const slot = await getSlotState(user.id);
  if (!slot.active_profile_id) {
    const { data: next } = await service
      .from("platform_profiles")
      .select("id")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next?.id) await setActiveProfile(user.id, next.id);
  }

  return Response.json({ ok: true });
}
