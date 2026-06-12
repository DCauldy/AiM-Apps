import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { getActiveProfile } from "@/lib/profiles/server";
import type {
  CmaAgentSettings,
  CmaCrmConnection,
  CmaEmailConnection,
} from "@/types/cma";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

const CRM_PUBLIC_FIELDS = `
  id, profile_id, platform, label, base_url,
  past_client_source, past_client_value,
  is_active, last_synced_at, last_error,
  created_at, updated_at
`;

const EMAIL_PUBLIC_FIELDS = `
  id, profile_id, provider, email_address, display_name,
  is_active, is_default,
  resend_domain, resend_dkim_status, resend_webhook_id,
  provider_metadata,
  last_send_at, last_error,
  created_at, updated_at
`;

const DEFAULT_CADENCE_DAYS = 90;
const DEFAULT_REMINDER_LEAD_DAYS = 7;

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
  // its own integrations.
  let crmQuery = service
    .from("cma_crm_connections")
    .select(CRM_PUBLIC_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (profile) crmQuery = crmQuery.eq("profile_id", profile.id);
  const { data: crmConnections } = await crmQuery;

  let espQuery = service
    .from("cma_email_connections")
    .select(EMAIL_PUBLIC_FIELDS)
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (profile) espQuery = espQuery.eq("profile_id", profile.id);
  const { data: espConnections } = await espQuery;

  return (
    <SettingsClient
      activePackId={activePackId}
      hasSubscription={hasSubscription}
      agentSettings={agentSettings}
      crmConnections={
        (crmConnections ?? []) as Array<
          Omit<
            CmaCrmConnection,
            | "api_key_encrypted"
            | "oauth_access_token_encrypted"
            | "oauth_refresh_token_encrypted"
          >
        >
      }
      espConnections={
        (espConnections ?? []) as Array<
          Omit<
            CmaEmailConnection,
            | "resend_api_key_encrypted"
            | "resend_webhook_secret_encrypted"
            | "provider_api_key_encrypted"
            | "provider_oauth_access_token_encrypted"
            | "provider_oauth_refresh_token_encrypted"
          >
        >
      }
    />
  );
}
