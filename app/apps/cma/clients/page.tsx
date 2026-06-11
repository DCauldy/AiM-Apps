import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import { ClientsClient } from "./clients-client";

export const dynamic = "force-dynamic";

export default async function CmaClientsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const profile = await getActiveProfile(user.id);
  const service = createServiceRoleClient();

  // Detect "no CRM connection yet" state so the client renders the
  // onboarding-style empty state instead of an empty client list with
  // confusing filter chips.
  let connQuery = service
    .from("cma_crm_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (profile) connQuery = connQuery.eq("profile_id", profile.id);
  const { count: crmCount } = await connQuery;

  return (
    <ClientsClient
      hasCrmConnection={(crmCount ?? 0) > 0}
    />
  );
}
