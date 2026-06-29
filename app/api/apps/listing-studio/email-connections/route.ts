import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import { listAppEmailConnections } from "@/lib/platform/connections";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/listing-studio/email-connections
 *
 * Returns the joined AppEmailConnection<"listing_studio">[] shape from
 * the shared platform_email_connections + app_email_connection_state
 * tables (Wave 9). webhook_secret_encrypted is stripped server-side,
 * replaced by webhook_secret_set: boolean.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  const service = createServiceRoleClient();
  const connections = await listAppEmailConnections(
    service,
    user.id,
    profile?.id ?? null,
    "listing_studio",
  );
  return Response.json({ connections });
}

// Connection creation flows through provider-specific routes:
//   POST /api/apps/listing-studio/email-connections/resend/verify-domain
//        → registers the agent's Resend domain + verifies DKIM
//   POST /api/apps/listing-studio/email-connections/sendgrid/verify-domain
//        → validates the API key + creates the row
export async function POST(_req: NextRequest) {
  return Response.json(
    {
      error:
        "Direct creation not supported. Use the provider-specific connect routes.",
    },
    { status: 501 },
  );
}
