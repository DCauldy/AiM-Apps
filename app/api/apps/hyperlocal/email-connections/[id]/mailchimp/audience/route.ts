import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  getAppEmailConnectionStateInternal,
  getPlatformEmailConnection,
  updateAppEmailState,
} from "@/lib/platform/connections";
import {
  mcAuthFromConnection,
  mcRequest,
} from "@/lib/hyperlocal/email/providers/mailchimp-client";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import type { HlEmailAppMetadata } from "@/types/platform-connections";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/apps/hyperlocal/email-connections/:id/mailchimp/audience
 * Body: { audience_id }
 *
 * Switch which Mailchimp audience Hyperlocal sends to. Side effects:
 *   1. Update app_state.provider_metadata.mailchimp.audience_id + name
 *   2. Delete the old webhook on the previous audience (best-effort)
 *   3. Provision a new webhook on the new audience with a fresh URL secret
 *      and store the secret on app_state.webhook_secret_encrypted
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
  const conn = await getPlatformEmailConnection(service, user.id, id);
  if (!conn || conn.provider !== "mailchimp") {
    return Response.json(
      { error: "Mailchimp connection not found" },
      { status: 404 },
    );
  }
  const state = await getAppEmailConnectionStateInternal(
    service,
    "hyperlocal",
    id,
  );
  if (!state || state.app !== "hyperlocal") {
    return Response.json(
      { error: "Hyperlocal state row missing for this connection" },
      { status: 404 },
    );
  }
  const metadata = state.provider_metadata as HlEmailAppMetadata;
  const auth = mcAuthFromConnection(conn, metadata);

  // Confirm the new audience exists + fetch its name for the metadata.
  let newAudience: { id: string; name: string; member_count: number | null };
  try {
    const data = await mcRequest<{
      id: string;
      name: string;
      stats?: { member_count?: number };
    }>(
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

  const prevMailchimp = (metadata.mailchimp ?? {}) as Record<string, unknown>;
  const prevAudienceId = prevMailchimp.audience_id as string | undefined;
  const prevWebhookId = prevMailchimp.webhook_id as string | undefined;

  // ---- Provision a new webhook on the new audience ----
  // Generate a fresh URL secret per audience switch — easier to invalidate
  // the old webhook cleanly and avoid replaying secrets.
  const newWebhookSecret = randomBytes(24).toString("hex");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin).replace(
    /\/+$/,
    "",
  );
  const newWebhookUrl = `${appUrl}/api/webhooks/mailchimp?secret=${encodeURIComponent(newWebhookSecret)}`;
  let newWebhookId: string | null = null;
  let webhookError: string | null = null;
  if (
    !newWebhookUrl.includes("://localhost") &&
    !newWebhookUrl.includes("://127.0.0.1")
  ) {
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
      webhookError =
        e instanceof Error ? e.message : "webhook provision failed";
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
  const nextMetadata: HlEmailAppMetadata = {
    ...metadata,
    mailchimp: {
      ...(metadata.mailchimp ?? {}),
      dc: metadata.mailchimp?.dc,
      audience_id: newAudience.id,
      server_prefix: metadata.mailchimp?.server_prefix,
    },
  };
  Object.assign(nextMetadata.mailchimp as Record<string, unknown>, {
    audience_name: newAudience.name,
    member_count: newAudience.member_count,
    webhook_id: newWebhookId,
    webhook_error: webhookError,
  });

  await updateAppEmailState(service, user.id, "hyperlocal", id, {
    providerMetadata: nextMetadata,
    // Only rotate the stored secret when we successfully provisioned the
    // new webhook. Otherwise the old secret stays valid for the existing
    // (still-active) webhook.
    ...(newWebhookId ? { webhookSecret: newWebhookSecret } : {}),
  });

  return Response.json({
    success: true,
    audience: newAudience,
    webhook: newWebhookId ? "provisioned" : "skipped",
    webhook_error: webhookError,
  });
}
