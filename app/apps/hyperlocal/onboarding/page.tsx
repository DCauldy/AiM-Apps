import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingChat } from "@/components/hyperlocal/onboarding/OnboardingChat";
import { ProfileMigrationBanner } from "@/components/profile/ProfileMigrationBanner";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";

export const dynamic = "force-dynamic";

export default async function HyperlocalOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireActiveProfileOrRedirect(user.id, "/apps/hyperlocal/onboarding");

  // Sender identity now comes from the user active profile, so the chat
  // should not re-ask for it. We force hasSender=true here so the existing
  // chat skips that section while waiting for its full rewrite.
  const { count: emailCount } = await supabase
    .from("hl_email_connections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);

  const hasEmail = (emailCount ?? 0) > 0;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6">
        <ProfileMigrationBanner what="Sender identity, brokerage, and brand visuals" />
      </div>
      <div className="flex-1 min-h-0">
        <OnboardingChat hasSender={true} hasEmail={hasEmail} />
      </div>
    </div>
  );
}
