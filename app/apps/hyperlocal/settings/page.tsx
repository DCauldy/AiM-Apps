import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function HyperlocalSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: crmConnections },
    { data: emailConnections },
    { data: suppressions },
  ] = await Promise.all([
    supabase
      .from("hl_crm_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("hl_email_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false }),
    supabase
      .from("hl_suppressions")
      .select("*")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <SettingsClient
      crmConnections={crmConnections ?? []}
      emailConnections={emailConnections ?? []}
      suppressions={suppressions ?? []}
    />
  );
}
