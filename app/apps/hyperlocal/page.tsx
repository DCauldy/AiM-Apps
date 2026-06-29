import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";

export default async function HyperlocalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Platform profile is the universal gate — missing one means the user
  // hasn't completed first-run setup at all, so send them to the chat
  // onboarding (not Hyperlocal's email-connection wizard, which assumes
  // identity is already captured).
  await requireActiveProfileOrRedirect(user.id, "/apps/hyperlocal");

  // Safe to non-null-assert: requireActiveProfileOrRedirect would have
  // redirected away if active_profile_id were null.
  const { data: meta } = await supabase
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .single();

  // Scope the readiness check to the active profile — a connection tied to a
  // different profile must not count.
  const { count: emailCount } = await supabase
    .from("hl_email_connections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("profile_id", meta!.active_profile_id)
    .eq("is_active", true);

  if ((emailCount ?? 0) > 0) {
    // Map-first front door is the home for Hyperlocal.
    redirect("/apps/hyperlocal/map");
  }

  redirect("/apps/hyperlocal/onboarding");
}
