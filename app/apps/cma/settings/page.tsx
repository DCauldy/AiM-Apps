import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  listAppCrmConnections,
  listAppEmailConnections,
} from "@/lib/platform/connections";
import type {
  CmaAgentSettings,
  CmaCrmConnection,
  CmaEmailConnection,
} from "@/types/cma";
import type {
  AppCrmConnection,
  AppEmailConnection,
} from "@/types/platform-connections";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

const DEFAULT_CADENCE_DAYS = 90;
const DEFAULT_REMINDER_LEAD_DAYS = 7;

type CrmConnPublic = Omit<
  CmaCrmConnection,
  | "api_key_encrypted"
  | "oauth_access_token_encrypted"
  | "oauth_refresh_token_encrypted"
>;
type EspConnPublic = Omit<
  CmaEmailConnection,
  | "resend_api_key_encrypted"
  | "resend_webhook_secret_encrypted"
  | "provider_api_key_encrypted"
  | "provider_oauth_access_token_encrypted"
  | "provider_oauth_refresh_token_encrypted"
>;

/** Flatten a joined CRM connection to the legacy CmaCrmConnection shape
 *  the SettingsClient (and CrmTab) still expect. Wave 11 will refactor
 *  the UI to consume AppCrmConnection<"listing_studio"> directly. */
function flattenCrm(conn: AppCrmConnection<"listing_studio">): CrmConnPublic {
  const filter = conn.state.filter_config ?? {};
  return {
    id: conn.connection.id,
    user_id: conn.connection.user_id,
    profile_id: conn.connection.profile_id,
    platform: conn.connection.platform as CrmConnPublic["platform"],
    label: conn.connection.label,
    base_url: conn.connection.base_url,
    past_client_source: filter.past_client_source ?? null,
    past_client_value: filter.past_client_value ?? null,
    is_active: conn.connection.is_active,
    last_synced_at: conn.state.last_synced_at,
    last_error: conn.state.last_error,
    created_at: conn.connection.created_at,
    updated_at: conn.connection.updated_at,
  };
}

/** Flatten a joined email connection to the legacy CmaEmailConnection
 *  shape. provider_metadata passes through verbatim; webhook_id moves
 *  from the platform row to the per-app state row in the new schema
 *  but the UI just reads it as a boolean for "is webhook configured." */
function flattenEsp(
  conn: AppEmailConnection<"listing_studio">,
): EspConnPublic {
  return {
    id: conn.connection.id,
    user_id: conn.connection.user_id,
    profile_id: conn.connection.profile_id,
    provider: conn.connection.provider as EspConnPublic["provider"],
    email_address: conn.connection.email_address,
    display_name: conn.connection.display_name,
    resend_domain: conn.connection.resend_domain,
    resend_domain_id: conn.connection.resend_domain_id,
    resend_dkim_status: conn.connection.resend_dkim_status,
    resend_webhook_id: conn.state.webhook_id,
    provider_metadata: conn.state.provider_metadata as Record<string, unknown>,
    is_active: conn.connection.is_active,
    is_default: conn.state.is_default,
    last_send_at: conn.state.last_send_at,
    last_error: conn.state.last_error,
    created_at: conn.connection.created_at,
    updated_at: conn.connection.updated_at,
  };
}

export default async function CmaSettingsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const service = createServiceRoleClient();
  const profile = await getActiveProfile(user.id);

  // Pack lookup — same shape UpgradeTab already reads.
  const { data: userPack } = await service
    .from("ls_user_packs")
    .select("pack_id, status, stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const activePackId =
    userPack && userPack.status !== "canceled" ? userPack.pack_id : null;
  const hasSubscription =
    !!userPack?.stripe_subscription_id && userPack.status !== "canceled";

  // Agent settings — falls back to defaults when row doesn't exist
  // yet. PATCHing the form upserts; no need to write here.
  const { data: agentSettingsRow } = await service
    .from("cma_agent_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const agentSettings: CmaAgentSettings =
    (agentSettingsRow as CmaAgentSettings | null) ?? {
      user_id: user.id,
      default_cadence_days: DEFAULT_CADENCE_DAYS,
      default_email_connection_id: null,
      reminder_lead_days: DEFAULT_REMINDER_LEAD_DAYS,
      manual_review_required: false,
      updated_at: new Date().toISOString(),
    };

  // Connection lists — profile-scoped so each branded persona owns
  // its own integrations. Comes back joined; flatten for the UI
  // until Wave 11 refactors the consumers.
  const crmJoined = await listAppCrmConnections(
    service,
    user.id,
    profile?.id ?? null,
    "listing_studio",
  );
  const espJoined = await listAppEmailConnections(
    service,
    user.id,
    profile?.id ?? null,
    "listing_studio",
  );

  return (
    <SettingsClient
      activePackId={activePackId}
      hasSubscription={hasSubscription}
      agentSettings={agentSettings}
      crmConnections={crmJoined.map(flattenCrm)}
      espConnections={espJoined.map(flattenEsp)}
    />
  );
}
