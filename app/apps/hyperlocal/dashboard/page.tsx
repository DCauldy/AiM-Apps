import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { getDashboardData } from "@/lib/hyperlocal/dashboard-data";
import { HyperlocalDashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function HyperlocalDashboardPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: meta } = await supabase
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();
  // First-timers go straight to onboarding instead of bouncing through
  // /apps/hyperlocal (which would just redirect here again).
  if (!meta?.active_profile_id) redirect("/apps/hyperlocal/onboarding");

  // Solo-first: one active profile. Team-mode will widen this array.
  const data = await getDashboardData(supabase, [meta.active_profile_id]);

  return <HyperlocalDashboardClient data={data} />;
}
