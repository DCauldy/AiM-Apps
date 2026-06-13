import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/hyperlocal/encryption";

// ============================================================
// Disconnect a sending connection — provider-specific cleanup
// (webhook removal, etc.) followed by row deletion.
//
// Used by:
//   - The DELETE email-connections route (manual trash-icon click)
//   - The "auto-replace prior connection" path on all four connect
//     entry points (verify-domain for Resend/SendGrid, /connect and
//     /oauth/callback for Mailchimp)
//
// Best-effort: each provider-side cleanup is wrapped — failures log
// and continue so the local row removal always happens. Leftovers on
// the provider side can be cleaned manually by the agent.
//
// Wave 9 schema: deletes the underlying platform_email_connections
// row (app_email_connection_state cascades). Webhook id + per-app
// metadata now live on the app_state row; callers must hydrate
// them into the PriorConnectionRef before invoking.
// ============================================================

export interface PriorConnectionRef {
  /** platform_email_connections.id */
  id: string;
  provider: string;
  /** Hyperlocal-app webhook id (from app_email_connection_state.webhook_id
   *  for the "hyperlocal" app). Resend connections store this; for
   *  Mailchimp/AC the id lives in provider_metadata instead. */
  resend_webhook_id?: string | null;
  resend_domain_id?: string | null;
  resend_api_key_encrypted?: string | null;
  /** Generic API-key column used by non-Resend providers (Mailchimp,
   *  ActiveCampaign). Resend-specific connections keep their key in
   *  `resend_api_key_encrypted` for historical reasons. */
  provider_api_key_encrypted?: string | null;
  provider_oauth_access_token_encrypted?: string | null;
  /** Per-app provider metadata (from app_email_connection_state for
   *  the "hyperlocal" app). Callers hydrate this from the app_state row. */
  provider_metadata?: Record<string, unknown> | null;
}

export async function disconnectPriorConnection(
  service: SupabaseClient,
  prior: PriorConnectionRef,
): Promise<void> {
  try {
    if (prior.provider === "resend") {
      await cleanupResendSide(prior);
    } else if (prior.provider === "sendgrid") {
      // SendGrid's event webhook is account-level (one per account), not
      // per-connection — leaving it pointed at our endpoint is harmless
      // when no Hyperlocal connection consumes from it. Skip cleanup.
    } else if (prior.provider === "mailchimp") {
      await cleanupMailchimpSide(prior);
    } else if (prior.provider === "activecampaign") {
      await cleanupActiveCampaignSide(prior);
    }
  } catch (e) {
    console.error(
      "[disconnect] provider-side cleanup failed",
      prior.provider,
      e instanceof Error ? e.message : e,
    );
  }
  const { error, count } = await service
    .from("platform_email_connections")
    .delete({ count: "exact" })
    .eq("id", prior.id);
  if (error) {
    console.error(
      "[disconnect] DB delete failed",
      prior.id,
      prior.provider,
      error.message,
      error.details,
      error.hint,
    );
    throw new Error(
      `Failed to delete connection ${prior.id}: ${error.message}`,
    );
  }
  if (!count) {
    console.warn(
      "[disconnect] DB delete affected 0 rows",
      prior.id,
      prior.provider,
    );
    throw new Error(
      `Connection ${prior.id} delete affected 0 rows — RLS or row vanished`,
    );
  }
}

async function cleanupResendSide(prior: PriorConnectionRef): Promise<void> {
  if (!prior.resend_api_key_encrypted || !prior.resend_webhook_id) return;
  const apiKey = decrypt(prior.resend_api_key_encrypted);
  const { deleteResendWebhook } = await import("@/lib/hyperlocal/email/providers/resend");
  await deleteResendWebhook(apiKey, prior.resend_webhook_id);
}

async function cleanupActiveCampaignSide(
  prior: PriorConnectionRef,
): Promise<void> {
  // AC webhook lives on the account, referenced by a per-connection
  // webhook id. The base URL + api key are stored on the connection.
  const meta = (prior.provider_metadata ?? {}) as {
    activecampaign?: { base_url?: string; webhook_id?: string };
  };
  const baseUrl = meta.activecampaign?.base_url;
  const webhookId = meta.activecampaign?.webhook_id;
  if (!baseUrl || !webhookId) return;
  const encryptedKey =
    prior.provider_api_key_encrypted ?? prior.resend_api_key_encrypted;
  if (!encryptedKey) return;
  const apiKey = decrypt(encryptedKey);

  await fetch(`${baseUrl.replace(/\/+$/, "")}/api/3/webhooks/${webhookId}`, {
    method: "DELETE",
    headers: { "Api-Token": apiKey },
  });
}

async function cleanupMailchimpSide(prior: PriorConnectionRef): Promise<void> {
  // Mailchimp webhook lives on the list (audience). The connection's
  // metadata holds the webhook id + audience id; the access token lives
  // either as OAuth or as an API key.
  const meta = (prior.provider_metadata ?? {}) as {
    mailchimp?: { dc?: string; audience_id?: string; webhook_id?: string };
  };
  const dc = meta.mailchimp?.dc;
  const audienceId = meta.mailchimp?.audience_id;
  const webhookId = meta.mailchimp?.webhook_id;
  if (!dc || !audienceId || !webhookId) return;

  const oauthEncrypted = prior.provider_oauth_access_token_encrypted;
  const apiEncrypted = prior.resend_api_key_encrypted; // legacy API-key fallback path
  let token: string | null = null;
  let isOAuth = false;
  if (oauthEncrypted) {
    token = decrypt(oauthEncrypted);
    isOAuth = true;
  } else if (apiEncrypted) {
    token = decrypt(apiEncrypted);
  }
  if (!token) return;

  await fetch(
    `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/webhooks/${webhookId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: isOAuth
          ? `OAuth ${token}`
          : "Basic " + Buffer.from(`hl:${token}`).toString("base64"),
      },
    },
  );
}
