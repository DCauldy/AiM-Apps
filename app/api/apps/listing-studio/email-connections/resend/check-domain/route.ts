import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/hyperlocal/encryption";
import { getResendDomain } from "@/lib/hyperlocal/email/providers/resend";
import {
  getPlatformEmailConnection,
  updateAppEmailState,
} from "@/lib/platform/connections";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/listing-studio/email-connections/resend/check-domain
 *      ?connection_id=...
 *
 * Polls Resend for current DKIM/SPF verification status and flips
 * is_active to true when the records are validated. Frontend calls
 * this on a tick while the agent is staring at the DNS-records panel
 * waiting for propagation.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("connection_id");
  if (!id)
    return Response.json(
      { error: "connection_id required" },
      { status: 400 },
    );

  const service = createServiceRoleClient();
  // Load with auth blobs — we need to decrypt resend_api_key_encrypted
  // to call Resend.
  const conn = await getPlatformEmailConnection(service, user.id, id);
  if (!conn) return Response.json({ error: "Not found" }, { status: 404 });
  if (conn.provider !== "resend") {
    return Response.json(
      { error: "Connection is not a Resend connection" },
      { status: 400 },
    );
  }
  if (!conn.resend_domain_id) {
    return Response.json(
      { error: "Connection has no Resend domain id" },
      { status: 400 },
    );
  }
  if (!conn.resend_api_key_encrypted) {
    return Response.json(
      { error: "Connection has no stored Resend API key — re-add it" },
      { status: 400 },
    );
  }

  try {
    const apiKey = decrypt(conn.resend_api_key_encrypted);
    const info = await getResendDomain(apiKey, conn.resend_domain_id);
    const verified = info.status === "verified";

    // Direct platform-row patch for resend_dkim_status (not on the
    // app_state row). Use service client.
    await service
      .from("platform_email_connections")
      .update({
        resend_dkim_status: verified ? "verified" : "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    // Flip is_active through the helper so the state-row updated_at
    // is bumped consistently with other settings flips.
    await updateAppEmailState(service, user.id, "listing_studio", id, {
      isActive: verified,
    });

    return Response.json({ status: info.status, records: info.records });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Check failed" },
      { status: 500 },
    );
  }
}
