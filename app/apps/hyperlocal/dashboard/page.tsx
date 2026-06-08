import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/hyperlocal/dashboard-data";
import { HyperlocalDashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function HyperlocalDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meta } = await supabase
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!meta?.active_profile_id) redirect("/apps/hyperlocal");

  // Solo-first: one active profile. Team-mode will widen this array.
  const data = await getDashboardData(supabase, [meta.active_profile_id]);

  return <HyperlocalDashboardClient data={data} />;
}
