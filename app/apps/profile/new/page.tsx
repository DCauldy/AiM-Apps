import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateProfile } from "@/lib/profiles/server";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { ProfileOnboardingChat } from "@/components/profile/onboarding/ProfileOnboardingChat";

export const dynamic = "force-dynamic";

/**
 * /apps/profile/new
 *
 * Default: conversational onboarding chat — the right experience for
 * a brand-new user landing here from the /apps welcome modal.
 *
 * ?form=1 escape: serves the legacy ProfileEditor (5-tab form). Used
 * by the "Prefer a form?" link in the chat header, and the natural
 * fit for power users adding a second profile from the /apps/profile
 * list who already know which fields they want to set.
 */
export default async function NewProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ form?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const capacity = await canCreateProfile(user.id);
  if (!capacity.allowed) {
    redirect("/apps/profile?slot_overrun=1");
  }

  const params = await searchParams;
  if (params.form === "1") {
    return <ProfileEditor />;
  }

  return <ProfileOnboardingChat />;
}
