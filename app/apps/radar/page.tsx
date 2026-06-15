import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";

// /apps/radar lands on the Dashboard tab. All five tabs (Dashboard,
// Monitor, Research, Optimize, Settings) live at /apps/radar/<tab>.
export default async function RadarIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireActiveProfileOrRedirect(user.id, "/apps/radar");
  redirect("/apps/radar/dashboard");
}
