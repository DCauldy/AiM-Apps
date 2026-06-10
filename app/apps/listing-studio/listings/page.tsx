import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { ListingsClient } from "./listings-client";
import type { ListingRow } from "@/types/listing-studio";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("ls_listings")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return <ListingsClient initialListings={(data ?? []) as ListingRow[]} />;
}
