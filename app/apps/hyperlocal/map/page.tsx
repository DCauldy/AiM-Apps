import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";
import { FEATURES } from "@/lib/feature-flags";
import { SphereMapClient } from "@/components/hyperlocal/sphere/SphereMapClient";

export default async function HyperlocalMapPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  if (!FEATURES.HYPERLOCAL_MAP_HOME) {
    redirect("/apps/hyperlocal/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireActiveProfileOrRedirect(user.id, "/apps/hyperlocal/map");

  const { campaign } = await searchParams;

  // Match the padded page container the rest of Hyperlocal uses — AppShell
  // intentionally adds none, so each page supplies its own.
  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <SphereMapClient editCampaignId={campaign ?? null} />
    </div>
  );
}
