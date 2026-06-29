import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CampaignsClient } from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function HyperlocalCampaignsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: campaigns } = await supabase
    .from("hl_campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return <CampaignsClient initialCampaigns={campaigns ?? []} />;
}
