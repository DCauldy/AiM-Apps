import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { getActiveProfile } from "@/lib/profiles/server";
import { IntegrationsClient } from "./integrations-client";

export const dynamic = "force-dynamic";

export default async function ProfileIntegrationsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const profile = await getActiveProfile(user.id);
  return (
    <IntegrationsClient
      profileName={profile?.display_name ?? null}
      hasProfile={!!profile}
    />
  );
}
