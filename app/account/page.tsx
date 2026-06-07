import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSlotState, countActiveProfiles } from "@/lib/profiles/server";
import { AccountClient } from "./account-client";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect((process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com") + "/apps");
  }

  const [slot, activeCount] = await Promise.all([
    getSlotState(user.id),
    countActiveProfiles(user.id),
  ]);

  const subscriptionTier = (user.app_metadata?.subscription_tier as string) ?? "standalone";
  const isAdmin = user.app_metadata?.is_admin === true;

  return (
    <AccountClient
      email={user.email ?? ""}
      fullName={(user.user_metadata?.full_name as string) ?? ""}
      subscriptionTier={subscriptionTier}
      slotCount={slot.profile_slot_count}
      activeProfileCount={activeCount}
      slotGraceUntil={slot.slot_grace_period_ends_at}
      isAdmin={isAdmin}
    />
  );
}
