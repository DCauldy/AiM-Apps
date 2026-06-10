import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { WorkspaceClient } from "./workspace-client";
import type { ListingRow } from "@/types/listing-studio";

export const dynamic = "force-dynamic";

export default async function ListingWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("ls_listings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!listing) notFound();

  return <WorkspaceClient listing={listing as ListingRow} />;
}
