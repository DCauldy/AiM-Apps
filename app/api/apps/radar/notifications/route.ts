import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";

export const dynamic = "force-dynamic";

// GET  → returns the user's notification toggles for the active profile
// POST → updates them ({ alerts_enabled?, digest_enabled? })

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  if (!profile) return Response.json({ status: "no_profile" }, { status: 400 });

  const service = createServiceRoleClient();
  const { data } = await service
    .from("radar_notification_state")
    .select("alerts_enabled, digest_enabled, last_alert_sent_at, last_digest_sent_at")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return Response.json({
    // Default both on if no row yet (per migration default).
    alerts_enabled: data?.alerts_enabled ?? true,
    digest_enabled: data?.digest_enabled ?? true,
    last_alert_sent_at: data?.last_alert_sent_at ?? null,
    last_digest_sent_at: data?.last_digest_sent_at ?? null,
  });
}

interface PrefsBody {
  alerts_enabled?: boolean;
  digest_enabled?: boolean;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  if (!profile) return Response.json({ status: "no_profile" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as PrefsBody;
  const updates: Record<string, unknown> = {
    profile_id: profile.id,
    user_id: user.id,
  };
  if (typeof body.alerts_enabled === "boolean") {
    updates.alerts_enabled = body.alerts_enabled;
  }
  if (typeof body.digest_enabled === "boolean") {
    updates.digest_enabled = body.digest_enabled;
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("radar_notification_state")
    .upsert(updates, { onConflict: "profile_id" });
  if (error) {
    return Response.json(
      { error: `update failed: ${error.message}` },
      { status: 500 },
    );
  }
  return Response.json({ status: "updated" });
}
