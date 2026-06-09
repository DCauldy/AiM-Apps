import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/lib/hyperlocal/encryption";
import {
  mcAuthFromConnection,
  mcRequest,
} from "@/lib/hyperlocal/email/providers/mailchimp-client";
import { randomBytes } from "node:crypto";
import type { HlEmailConnection } from "@/types/hyperlocal";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/apps/hyperlocal/email-connections/:id/mailchimp/audience
 * Body: { audience_id }
 *
 * Switch which Mailchimp audience Hyperlocal sends to. Side effects:
 *   1. Update connection.provider_metadata.mailchimp.audience_id + name
 *   2. Delete the old webhook on the previous audience (best-effort)
 *   3. Provision a new webhook on the new audience with a fresh URL secret
 *
 * Webhooks in Mailchimp are per-list. Switching audiences without
 * re-provisioning would leave bounce/unsubscribe events on the wrong
 * audience and miss them on the new one.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const audienceId = String(body.audience_id ?? "").trim();
  if (!audienceId) {
    return Response.json({ error: "audience_id required" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: conn } = await service
    .from("hl_email_connections")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("provider", "mailchimp")
    .maybeSingle();
  if (!conn) {
    return Response.json({ error: "Mailchimp connection not found" }, { status: 404 });
  }

  const typed = conn as HlEmailConnection;
  const auth = mcAuthFromConnection(typed);

  // Confirm the new audience exists + fetch its name for the metadata.
  let newAudience: { id: string; name: string; member_count: number | null };
  try {
    const data = await mcRequest<{ id: string; name: string; stats?: { member_count?: number } }>(
      auth,
      "GET",
      `/lists/${audienceId}?fields=id,name,stats.member_count`,
    );
    newAudience = {
      id: data.id,
      name: data.name,
      member_count: data.stats?.member_count ?? null,
    };
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Audience not found" },
      { status: 400 },
    );
  }

  const prevMeta = (conn.provider_metadata ?? {}) as {
    mailchimp?: {
      dc?: string;
      audience_id?: string;
      webhook_id?: string;
    };
  };
  const prevAudienceId = prevMeta.mailchimp?.audience_id;
  const prevWebhookId = prevMeta.mailchimp?.webhook_id;

  // ---- Provision a new webhook on the new audience ----
  // Generate a fresh URL secret per audience switch — easier to invalidate
  // the old webhook cleanly and avoid replaying secrets.
  const newWebhookSecret = randomBytes(24).toString("hex");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin).replace(/\/+$/, "");
  const newWebhookUrl = `${appUrl}/api/webhooks/mailchimp?secret=${encodeURIComponent(newWebhookSecret)}`;
  let newWebhookId: string | null = null;
  let webhookError: string | null = null;
  if (!newWebhookUrl.includes("://localhost") && !newWebhookUrl.includes("://127.0.0.1")) {
    try {
      const wh = await mcRequest<{ id: string }>(
        auth,
        "POST",
        `/lists/${newAudience.id}/webhooks`,
        {
          url: newWebhookUrl,
          events: {
            subscribe: false,
            unsubscribe: true,
            profile: false,
            cleaned: true,
            upemail: false,
            campaign: true,
          },
          sources: { user: true, admin: true, api: true },
        },
      );
      newWebhookId = wh.id;
    } catch (e) {
      webhookError = e instanceof Error ? e.message : "webhook provision failed";
    }
  } else {
    webhookError =
      "Webhook skipped — localhost isn't reachable from Mailchimp. Set NEXT_PUBLIC_APP_URL to a tunnel and retry.";
  }

  // ---- Delete the old webhook (best-effort) ----
  if (prevAudienceId && prevWebhookId && prevAudienceId !== newAudience.id) {
    try {
      await mcRequest<unknown>(
        auth,
        "DELETE",
        `/lists/${prevAudienceId}/webhooks/${prevWebhookId}`,
      );
    } catch {
      // Webhook was probably already deleted; ignore.
    }
  }

  // ---- Persist updated metadata + secret ----
  const updateBody: Record<string, unknown> = {
    provider_metadata: {
      ...(conn.provider_metadata ?? {}),
      mailchimp: {
        ...prevMeta.mailchimp,
        audience_id: newAudience.id,
        audience_name: newAudience.name,
        member_count: newAudience.member_count,
        webhook_id: newWebhookId,
        webhook_error: webhookError,
      },
    },
    updated_at: new Date().toISOString(),
  };
  if (newWebhookId) {
    updateBody.resend_webhook_secret_encrypted = encrypt(newWebhookSecret);
  }

  // Ensure decrypt import survives tree-shake (used implicitly via auth helpers).
  void decrypt;

  const { error: updateErr } = await service
    .from("hl_email_connections")
    .update(updateBody)
    .eq("id", id);
  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    audience: newAudience,
    webhook: newWebhookId ? "provisioned" : "skipped",
    webhook_error: webhookError,
  });
}
