import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/hyperlocal/encryption";
import { getOrCreateResendWebhook } from "@/lib/hyperlocal/email/providers/resend";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/email-connections/:id/webhook/provision
 *
 * Uses the stored Resend API key to create (or reuse) a webhook in the
 * customer's Resend account pointing at our ingester, then persists the
 * webhook id + signing secret on the connection. Eliminates the manual
 * "copy URL → paste signing secret" dance.
 *
 * Endpoint URL derivation:
 *   NEXT_PUBLIC_APP_URL takes precedence, else falls back to the request's
 *   origin. Local dev (localhost:6060) will be rejected by Resend — agents
 *   must use a tunnel (cloudflared / ngrok) or the deployed environment.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: conn } = await service
    .from("hl_email_connections")
    .select("id, user_id, resend_api_key_encrypted, resend_webhook_id, resend_webhook_secret_encrypted")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conn) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }
  if (!conn.resend_api_key_encrypted) {
    return Response.json(
      { error: "Connection has no Resend API key stored — reconnect under Settings → Email" },
      { status: 400 },
    );
  }

  let apiKey: string;
  try {
    apiKey = decrypt(conn.resend_api_key_encrypted);
  } catch {
    return Response.json({ error: "Failed to decrypt API key" }, { status: 500 });
  }

  const endpointUrl = resolveWebhookEndpoint(req);
  if (!endpointUrl) {
    return Response.json(
      { error: "Cannot derive a webhook URL — set NEXT_PUBLIC_APP_URL to your deployed origin" },
      { status: 400 },
    );
  }
  if (endpointUrl.includes("://localhost") || endpointUrl.includes("://127.0.0.1")) {
    return Response.json(
      {
        error:
          "Resend can't reach localhost. Deploy first, or expose a tunnel and set NEXT_PUBLIC_APP_URL to the tunnel URL.",
      },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await getOrCreateResendWebhook(apiKey, endpointUrl, conn.resend_webhook_id);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Webhook provisioning failed" },
      { status: 500 },
    );
  }

  const { error: updateError } = await service
    .from("hl_email_connections")
    .update({
      resend_webhook_id: result.webhook_id,
      resend_webhook_secret_encrypted: encrypt(result.signing_secret),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    webhook_id: result.webhook_id,
    endpoint: endpointUrl,
    reused: result.reused,
  });
}

function resolveWebhookEndpoint(req: NextRequest): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (base) return `${base}/api/webhooks/resend`;
  // Fallback to request origin (useful for previews where NEXT_PUBLIC_APP_URL
  // might not be set). Won't help in local dev but won't crash either.
  const origin = req.nextUrl.origin;
  if (origin) return `${origin.replace(/\/+$/, "")}/api/webhooks/resend`;
  return null;
}
