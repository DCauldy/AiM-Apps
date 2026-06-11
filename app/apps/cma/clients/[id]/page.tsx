import { notFound, redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { CmaClient, CmaClientDelivery } from "@/types/cma";
import { ClientDetail } from "./client-detail";

export const dynamic = "force-dynamic";

export default async function CmaClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const service = createServiceRoleClient();

  const { data: client, error: clientErr } = await service
    .from("cma_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (clientErr || !client) notFound();

  const { data: deliveries } = await service
    .from("cma_client_deliveries")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  return (
    <ClientDetail
      initialClient={client as CmaClient}
      initialDeliveries={(deliveries ?? []) as CmaClientDelivery[]}
    />
  );
}
