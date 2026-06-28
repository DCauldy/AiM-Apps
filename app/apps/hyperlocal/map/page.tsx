import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";
import { FEATURES } from "@/lib/feature-flags";
import { SphereMapClient } from "@/components/hyperlocal/sphere/SphereMapClient";

export default async function HyperlocalMapPage() {
  if (!FEATURES.HYPERLOCAL_MAP_HOME) {
    redirect("/apps/hyperlocal/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireActiveProfileOrRedirect(user.id, "/apps/hyperlocal/map");

  return <SphereMapClient />;
}
