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

  // "Onboarded" check: user has an active Profile (sender identity lives there
  // now) AND at least one active email connection.
  const [{ data: meta }, { count: emailCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("active_profile_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("hl_email_connections")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  const isOnboarded = Boolean(meta?.active_profile_id) && (emailCount ?? 0) > 0;

  if (isOnboarded) {
    redirect("/apps/hyperlocal/dashboard");
  }

  redirect("/apps/hyperlocal/onboarding");
}
