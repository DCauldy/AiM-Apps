import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import type {
  AppSlug,
  PlatformEmailConnectionPublic,
} from "@/types/platform-connections";

export const dynamic = "force-dynamic";

const PLATFORM_EMAIL_PUBLIC = `
  id, user_id, profile_id, provider, email_address, display_name,
  resend_domain, resend_domain_id, resend_dkim_status,
  is_active, created_at, updated_at
`;

interface AppStateSummary {
  app: AppSlug;
  state_id: string;
  is_default: boolean;
  paused: boolean;
  last_send_at: string | null;
  last_error: string | null;
}

export interface ProfileEmailConnectionWithUsage {
  connection: PlatformEmailConnectionPublic;
  used_by: AppStateSummary[];
}

/**
 * GET /api/profile/integrations/email-connections
 *
 * Returns the active profile's email connections + per-app state
 * summaries. Tells the agent which apps are sending through each
 * verified domain.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  if (!profile) return Response.json({ connections: [] });

  const service = createServiceRoleClient();
  const { data: connRows, error } = await service
    .from("platform_email_connections")
    .select(PLATFORM_EMAIL_PUBLIC)
    .eq("user_id", user.id)
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const connections = (connRows ?? []) as PlatformEmailConnectionPublic[];
  if (connections.length === 0) return Response.json({ connections: [] });

  const { data: stateRows } = await service
    .from("app_email_connection_state")
    .select(
      "id, connection_id, app, is_default, paused, last_send_at, last_error",
    )
    .in(
      "connection_id",
      connections.map((c) => c.id),
    );

  const stateMap = new Map<string, AppStateSummary[]>();
  for (const row of (stateRows ?? []) as Array<{
    id: string;
    connection_id: string;
    app: AppSlug;
    is_default: boolean;
    paused: boolean;
    last_send_at: string | null;
    last_error: string | null;
  }>) {
    const arr = stateMap.get(row.connection_id) ?? [];
    arr.push({
      app: row.app,
      state_id: row.id,
      is_default: row.is_default,
      paused: row.paused,
      last_send_at: row.last_send_at,
      last_error: row.last_error,
    });
    stateMap.set(row.connection_id, arr);
  }

  const response: ProfileEmailConnectionWithUsage[] = connections.map((c) => ({
    connection: c,
    used_by: stateMap.get(c.id) ?? [],
  }));
  return Response.json({ connections: response });
}

/**
 * POST — same deferral as the CRM endpoint. Provider verification
 * requires app context (which app's webhook to provision, where to
 * point check-domain polls).
 */
export async function POST(_req: NextRequest) {
  return Response.json(
    {
      error:
        "Profile-level creation isn't supported — connect an ESP from the app that will use it (Hyperlocal or CMA settings).",
    },
    { status: 501 },
  );
}
