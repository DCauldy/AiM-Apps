import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingChat } from "@/components/hyperlocal/onboarding/OnboardingChat";

export const dynamic = "force-dynamic";

export default async function HyperlocalOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If the user already has a sender + email connection, skip onboarding
  const [{ count: senderCount }, { count: emailCount }] = await Promise.all([
    supabase
      .from("platform_sender_profiles")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("hl_email_connections")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  const hasSender = (senderCount ?? 0) > 0;
  const hasEmail = (emailCount ?? 0) > 0;

  return <OnboardingChat hasSender={hasSender} hasEmail={hasEmail} />;
}
