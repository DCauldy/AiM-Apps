import "server-only";

import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";

export const dynamic = "force-dynamic";

// GET  → list this user's active + recently-deactivated share links
// POST → create a new share link for the active profile
//        Body: { label?: string, expires_in_days?: number | null }

/**
 * Opaque, URL-safe slug. 16 base64url chars = ~96 bits of entropy.
 * Not derivable from any user-facing identifier.
 */
function generateToken(): string {
  return randomBytes(12).toString("base64url");
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: links } = await service
    .from("radar_share_links")
    .select(
      "id, token, label, is_active, view_count, last_viewed_at, created_at, expires_at, profile_id",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return Response.json({ links: links ?? [] });
}

interface CreateBody {
  label?: string;
  expires_in_days?: number | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json({ error: "no active profile" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const label = body.label?.trim().slice(0, 80) || null;
  const expiresAt =
    typeof body.expires_in_days === "number" && body.expires_in_days > 0
      ? new Date(
          Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;

  const service = createServiceRoleClient();

  // Retry on the very unlikely collision (96 bits, but cheap to do).
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateToken();
    const { data, error } = await service
      .from("radar_share_links")
      .insert({
        token,
        user_id: user.id,
        profile_id: profile.id,
        label,
        expires_at: expiresAt,
      })
      .select(
        "id, token, label, is_active, view_count, last_viewed_at, created_at, expires_at",
      )
      .single();

    if (!error && data) {
      return Response.json({ status: "created", link: data });
    }
    // 23505 = unique-violation. Anything else, bail.
    if (error?.code !== "23505") {
      return Response.json(
        { error: error?.message ?? "insert failed" },
        { status: 500 },
      );
    }
  }
  return Response.json(
    { error: "couldn't generate a unique token after 3 tries" },
    { status: 500 },
  );
}
