import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingChat } from "@/components/hyperlocal/onboarding/OnboardingChat";
import { ProfileFieldsBanner } from "@/components/profile/ProfileFieldsBanner";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";

export const dynamic = "force-dynamic";

export default async function HyperlocalOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireActiveProfileOrRedirect(user.id, "/apps/hyperlocal/onboarding");

  // Scope readiness checks to the active profile so we don't show "Connect"
  // for connections that exist under a different profile this user owns.
  const { data: meta } = await supabase
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();
  const activeProfileId = meta?.active_profile_id ?? null;

  const profileScopedCount = (table: string) =>
    activeProfileId
      ? supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("profile_id", activeProfileId)
          .eq("is_active", true)
      : Promise.resolve({ count: 0 });

  const [{ count: emailCount }, { count: crmCount }] = await Promise.all([
    profileScopedCount("hl_email_connections"),
    profileScopedCount("hl_crm_connections"),
  ]);

  const hasEmail = (emailCount ?? 0) > 0;
  const hasCrm = (crmCount ?? 0) > 0;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6">
        <ProfileFieldsBanner what="Sender identity, brokerage, and brand visuals" />
      </div>
      <div className="flex-1 min-h-0">
        <OnboardingChat hasEmail={hasEmail} hasCrm={hasCrm} />
      </div>
    </div>
  );
}
