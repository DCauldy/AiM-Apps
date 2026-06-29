import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Save / resume for new-profile onboarding (one draft per user).
 *   GET    → { draft: { mode, data, updated_at } | null }
 *   PUT    → upsert { mode, data }
 *   DELETE → clear the draft (called once a profile is created)
 */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("profile_onboarding_drafts")
    .select("mode, data, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({ draft: data ?? null });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { mode?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (body.mode !== "magic" && body.mode !== "control") {
    return Response.json({ error: "Invalid mode" }, { status: 400 });
  }

  const { error } = await supabase.from("profile_onboarding_drafts").upsert(
    {
      user_id: user.id,
      mode: body.mode,
      data: body.data ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("profile_onboarding_drafts")
    .delete()
    .eq("user_id", user.id);
  return Response.json({ ok: true });
}
