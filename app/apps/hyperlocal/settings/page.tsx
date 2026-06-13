import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveProfile } from "@/lib/profiles/server";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function HyperlocalSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // hl_user_packs is only readable via the service-role client (RLS scope).
  const service = createServiceRoleClient();

  // Wave 12: CRM + email connections moved to /apps/profile/[id]?tab=
  // {crm|mail}. This page only loads what the remaining Suppression +
  // History + Upgrade tabs (and the integrations callout) actually need.
  const profile = await getActiveProfile(user.id);

  const [{ data: suppressions }, { data: userPack }] = await Promise.all([
    supabase
      .from("hl_suppressions")
      .select("*")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false })
      .limit(200),
    service
      .from("hl_user_packs")
      .select("pack_id, status, stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const activePackId =
    userPack && userPack.status !== "canceled" ? userPack.pack_id : null;
  const hasSubscription =
    !!userPack?.stripe_subscription_id && userPack.status !== "canceled";

  return (
    <SettingsClient
      suppressions={suppressions ?? []}
      activePackId={activePackId}
      hasSubscription={hasSubscription}
      profileId={profile?.id ?? null}
    />
  );
}
