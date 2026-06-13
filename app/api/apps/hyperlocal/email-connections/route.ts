import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { listAppEmailConnections } from "@/lib/platform/connections";
import { getActiveProfile } from "@/lib/profiles/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/email-connections
 * Returns AppEmailConnection<"hyperlocal">[] — platform identity joined with
 * the Hyperlocal-app state row. Auth blobs + webhook secrets stripped by the
 * helper; the `webhook_secret_set` boolean replaces the encrypted blob for UI.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json(
      { error: "No active profile — set one up before viewing connections" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const connections = await listAppEmailConnections(
    service,
    user.id,
    profile.id,
    "hyperlocal",
  );
  return Response.json({ connections });
}

// POST handler intentionally absent — sending connections are created through
// provider-specific verify/connect routes (Resend verify-domain, SendGrid
// verify-domain, Mailchimp connect/oauth, ActiveCampaign connect).
export async function POST(_req: NextRequest) {
  return Response.json(
    {
      error:
        "Direct creation not supported. Use the provider-specific verify/connect routes.",
    },
    { status: 501 },
  );
}
