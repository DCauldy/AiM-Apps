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

  const { data: meta } = await supabase
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();

  // No active profile yet: punt to the unified profile setup, which will
  // return the user here when done.
  if (!meta?.active_profile_id) {
    redirect("/apps/hyperlocal/onboarding");
  }

  // Scope the readiness check to the active profile — a connection tied to a
  // different profile must not count.
  const { count: emailCount } = await supabase
    .from("hl_email_connections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("profile_id", meta.active_profile_id)
    .eq("is_active", true);

  if ((emailCount ?? 0) > 0) {
    redirect("/apps/hyperlocal/dashboard");
  }

  redirect("/apps/hyperlocal/onboarding");
}
