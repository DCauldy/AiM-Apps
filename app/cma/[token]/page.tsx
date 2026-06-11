import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  buildCmaUnsubscribeUrl,
  generateCmaUnsubscribeToken,
} from "@/lib/listing-studio/email/unsubscribe";
import type { CmaClient, CmaClientDelivery } from "@/types/cma";
import type { PlatformProfile } from "@/types/platform-profile";
import { LandingPage } from "./landing-page";

export const dynamic = "force-dynamic";
// Public route — no auth, no profile-scoping. RLS bypassed via the
// service-role client; the landing_page_token in the URL is the
// authorization (signed-strength random 192-bit).
export const runtime = "nodejs";

interface CmaRunRow {
  id: string;
  comps: unknown;
  adjustment_grid: unknown;
  appraised_value_cents: number | null;
  marketable_value_cents: number | null;
  recommended_price_cents: number | null;
  seller_narrative_md: string | null;
  pipeline_error: string | null;
  generated_at: string;
}

export default async function CmaLandingRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  // 1. Load the delivery row via the URL token.
  const { data: delivery } = await supabase
    .from("cma_client_deliveries")
    .select("*")
    .eq("landing_page_token", token)
    .maybeSingle();
  if (!delivery) notFound();
  const deliveryRow = delivery as CmaClientDelivery;

  // 2. Load the client + the CMA run referenced by this delivery.
  const [{ data: clientRow }, { data: runRow }] = await Promise.all([
    supabase
      .from("cma_clients")
      .select("*")
      .eq("id", deliveryRow.client_id)
      .maybeSingle(),
    deliveryRow.cma_run_id
      ? supabase
          .from("ls_cma_runs")
          .select("*")
          .eq("id", deliveryRow.cma_run_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!clientRow) notFound();
  const client = clientRow as CmaClient;
  const run = (runRow ?? null) as CmaRunRow | null;

  // 3. Resolve agent profile for header + signature.
  const targetProfileId = client.profile_id;
  const { data: agentRow } = targetProfileId
    ? await supabase
        .from("platform_profiles")
        .select("*")
        .eq("id", targetProfileId)
        .maybeSingle()
    : await supabase
        .from("platform_profiles")
        .select("*")
        .eq("user_id", client.user_id)
        .eq("is_default", true)
        .maybeSingle();
  const agent = (agentRow ?? null) as PlatformProfile | null;

  // 4. Prior delivery for vs-last panel.
  const { data: prior } = await supabase
    .from("cma_client_deliveries")
    .select("recommended_price_cents, estimated_value_cents, delivered_at")
    .eq("client_id", client.id)
    .neq("id", deliveryRow.id)
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 5. Record the visit (open-equivalent for the public landing). We
  //    track this independently of the ESP webhook so even mail clients
  //    that strip open-pixels still register a landing-page visit.
  if (!deliveryRow.opened_at) {
    await supabase
      .from("cma_client_deliveries")
      .update({
        opened_at: new Date().toISOString(),
        opened_count: deliveryRow.opened_count + 1,
      })
      .eq("id", deliveryRow.id);
  } else {
    await supabase
      .from("cma_client_deliveries")
      .update({ opened_count: deliveryRow.opened_count + 1 })
      .eq("id", deliveryRow.id);
  }

  // Mint a fresh unsubscribe JWT for the footer link. Distinct from the
  // landing_page_token (random opaque string) — needed to support
  // /api/cma/unsubscribe which expects a signed JWT.
  const unsubToken = await generateCmaUnsubscribeToken(client.id);
  const unsubscribeUrl = buildCmaUnsubscribeUrl(unsubToken);

  return (
    <LandingPage
      delivery={deliveryRow}
      client={client}
      run={run}
      agent={agent}
      prior={prior ?? null}
      unsubscribeUrl={unsubscribeUrl}
    />
  );
}
