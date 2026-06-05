import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HyperlocalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user has at least one campaign + sender + email connection
  // (rough "onboarded" signal — refined when onboarding chat ships in PR11)
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

  const isOnboarded = (senderCount ?? 0) > 0 && (emailCount ?? 0) > 0;

  if (isOnboarded) {
    redirect("/apps/hyperlocal/dashboard");
  }

  redirect("/apps/hyperlocal/onboarding");
}
