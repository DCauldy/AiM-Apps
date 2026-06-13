import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { getActiveProfile } from "@/lib/profiles/server";
import {
  listAppCrmConnections,
  listAppEmailConnections,
} from "@/lib/platform/connections";
import type { CmaAgentSettings } from "@/types/cma";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

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

  // Connection lists come back as the joined AppCrmConnection /
  // AppEmailConnection shape (Wave 9+10). Tabs consume directly now —
  // the flatten band-aid that bridged Wave 10 → Wave 11 is gone.
  const crmConnections = await listAppCrmConnections(
    service,
    user.id,
    profile?.id ?? null,
    "listing_studio",
  );
  const espConnections = await listAppEmailConnections(
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
      crmConnections={crmConnections}
      espConnections={espConnections}
    />
  );
}
