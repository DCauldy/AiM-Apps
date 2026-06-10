import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function ListingStudioSettingsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  // hl_user_packs-style pack lookup; service role so RLS doesn't block.
  const service = createServiceRoleClient();
  const { data: userPack } = await service
    .from("ls_user_packs")
    .select("pack_id, status, stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const activePackId =
    userPack && userPack.status !== "canceled" ? userPack.pack_id : null;
  const hasSubscription =
    !!userPack?.stripe_subscription_id && userPack.status !== "canceled";

  return (
    <SettingsClient
      activePackId={activePackId}
      hasSubscription={hasSubscription}
    />
  );
}
