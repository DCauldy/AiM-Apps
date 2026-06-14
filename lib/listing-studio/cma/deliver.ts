import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { runCmaPipeline } from "@/lib/listing-studio/cma/pipeline";
import { renderCmaEmail } from "@/lib/listing-studio/email/render";
import { sendCmaEmail } from "@/lib/listing-studio/email/send";
import {
  buildCmaLandingUrl,
  buildCmaUnsubscribeUrl,
  generateCmaUnsubscribeToken,
  generateLandingPageToken,
} from "@/lib/listing-studio/email/unsubscribe";
import {
  getAppEmailConnection,
  getDefaultAppEmailConnection,
  getPlatformEmailConnection,
  updateAppEmailState,
} from "@/lib/platform/connections";
import type { CmaClient, CmaClientDelivery } from "@/types/cma";
import type { PlatformEmailConnection } from "@/types/platform-connections";
import type { PlatformProfile } from "@/types/platform-profile";

// ============================================================
// runCmaDelivery — end-to-end CMA delivery for one client.
//
// Pure async function over (clientId, triggerSource, emailConnectionId).
// Thin task wrappers (the Trigger.dev cma-deliver task) just set
// observability metadata and call this. Kept out of the trigger file
// so the same code path is reachable from tests, ad-hoc scripts, and
// any future caller without dragging Trigger.dev's runtime into it.
//
// Retries are intentionally NOT supported here — the pipeline writes
// ls_cma_runs.pipeline_error on failure and the delivery row stores
// send_error, so an automatic retry would mask the underlying problem
// AND re-burn RapidAPI credits. The task wrapper should set
// retry.maxAttempts: 1.
//
// The pipeline's 30-day cma_client_deliveries.cma_run_id reuse cache
// protects us if a downstream step somehow re-invokes this function
// for the same client within the window.
// ============================================================

export interface RunCmaDeliveryInput {
  /** cma_clients.id — the only required input. */
  clientId: string;
  /** "cadence" | "manual" | "first_enrollment" — written onto
   *  cma_client_deliveries.trigger_source for analytics. */
  triggerSource: "cadence" | "manual" | "first_enrollment";
  /** Optional explicit email connection override; falls back to the
   *  agent's default listing_studio app_email_connection_state row. */
  emailConnectionId?: string;
}

export interface RunCmaDeliveryResult {
  success: boolean;
  deliveryId: string;
  cmaRunId: string;
  providerMessageId: string | null;
}

export async function runCmaDelivery(
  input: RunCmaDeliveryInput,
): Promise<RunCmaDeliveryResult> {
  const { clientId, triggerSource, emailConnectionId } = input;
  const supabase = createServiceRoleClient();

  // 1. Load client + sanity-check enrollment.
  const { data: clientData, error: clientErr } = await supabase
    .from("cma_clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr || !clientData) {
    throw new Error(
      `cma-deliver: client ${clientId} not found (${clientErr?.message ?? "no row"})`,
    );
  }
  const client = clientData as CmaClient;
  if (client.unsubscribed_at) throw new Error("Client is unsubscribed");
  // Manual sends ignore the enrolled flag — agent explicitly asked.
  // Cadence + first_enrollment require it.
  if (triggerSource !== "manual" && !client.enrolled) {
    throw new Error("Client is not enrolled");
  }
  if (!client.address || !client.email) {
    throw new Error("Client is missing address or email");
  }

  // 2. Resolve sending connection — caller-specified or the agent's
  //    default for the CMA app. We need the platform row (auth blob)
  //    for the adapter and capture the platform connection id for the
  //    delivery row FK + per-app state updates.
  const joined = emailConnectionId
    ? await getAppEmailConnection(
        supabase,
        client.user_id,
        "listing_studio",
        emailConnectionId,
      )
    : await getDefaultAppEmailConnection(
        supabase,
        client.user_id,
        client.profile_id ?? null,
        "listing_studio",
      );
  if (!joined) {
    throw new Error(
      emailConnectionId
        ? `Email connection ${emailConnectionId} not found`
        : "No default email connection configured",
    );
  }
  const platformConn = await getPlatformEmailConnection(
    supabase,
    client.user_id,
    joined.connection.id,
  );
  if (!platformConn) {
    throw new Error(
      `Platform email connection ${joined.connection.id} not found`,
    );
  }
  const emailConn: {
    platform: PlatformEmailConnection;
    profile_id: string | null;
  } = {
    platform: platformConn,
    profile_id: joined.connection.profile_id,
  };

  // 3. Resolve agent profile for signature + branding.
  const targetProfileId = client.profile_id ?? emailConn.profile_id;
  const agentQuery = targetProfileId
    ? supabase
        .from("platform_profiles")
        .select("*")
        .eq("id", targetProfileId)
    : supabase
        .from("platform_profiles")
        .select("*")
        .eq("user_id", client.user_id)
        .eq("is_default", true);
  const { data: agentData } = await agentQuery.maybeSingle();
  // Profile is best-effort; the email renderer falls back to neutral
  // copy when fields are null.
  const agent = (agentData ?? null) as PlatformProfile | null;

  // 4. Load prior delivery to compute the vs-last-CMA delta.
  const { data: priorData } = await supabase
    .from("cma_client_deliveries")
    .select(
      "recommended_price_cents, estimated_value_cents, marketable_value_cents",
    )
    .eq("client_id", client.id)
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const priorDelivery = priorData ?? null;

  // 5. Run the CMA pipeline.
  const cmaResult = await runCmaPipeline({
    address: client.address,
    subject: client.property_facts ?? {},
  });

  // 5b. Persist the zpid + image_url the pipeline backfilled onto
  //     the subject so the next render (landing page open, future
  //     preview, future delivery) doesn't re-fetch — and so the
  //     hero image actually shows up on this delivery's landing page
  //     instead of falling through to the Mapbox map.
  const mergedFacts = {
    ...(client.property_facts ?? {}),
    ...cmaResult.hydratedSubject,
  };
  await supabase
    .from("cma_clients")
    .update({
      property_facts: mergedFacts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", client.id);
  (client as { property_facts: typeof mergedFacts }).property_facts =
    mergedFacts;

  // 6. Mint the landing-page token + unsubscribe token; persist the
  //    delivery row in `pending` state so the row exists before the
  //    ESP send attempts (engagement webhooks can correlate by token).
  const landingToken = generateLandingPageToken();
  const unsubToken = await generateCmaUnsubscribeToken(client.id);

  const { data: deliveryData, error: deliveryErr } = await supabase
    .from("cma_client_deliveries")
    .insert({
      client_id: client.id,
      cma_run_id: cmaResult.cmaRunId,
      // Persist the connection used so the webhook handler can
      // load the right per-connection signing secret without
      // guessing among the user's connections.
      email_connection_id: platformConn.id,
      landing_page_token: landingToken,
      trigger_source: triggerSource,
      recommended_price_cents: cmaResult.recommendedPriceCents,
      estimated_value_cents: cmaResult.estimatedValueCents,
      marketable_value_cents: cmaResult.marketableValueCents,
    })
    .select("*")
    .single();
  if (deliveryErr || !deliveryData) {
    throw new Error(`Failed to create delivery row: ${deliveryErr?.message}`);
  }
  const delivery = deliveryData as CmaClientDelivery;

  // 7. Render the email.
  const delta =
    priorDelivery && priorDelivery.recommended_price_cents
      ? {
          delta_since_last_cents:
            cmaResult.recommendedPriceCents -
            priorDelivery.recommended_price_cents,
          delta_since_last_pct:
            ((cmaResult.recommendedPriceCents -
              priorDelivery.recommended_price_cents) /
              priorDelivery.recommended_price_cents) *
            100,
        }
      : {};

  const rendered = renderCmaEmail({
    client: {
      first_name: client.first_name,
      last_name: client.last_name,
      address: client.address ?? "",
      last_delivered_at: client.last_delivered_at ?? null,
    },
    cma: {
      recommended_price_cents: cmaResult.recommendedPriceCents,
      estimated_value_cents: cmaResult.estimatedValueCents,
      ...delta,
    },
    landing_url: buildCmaLandingUrl(landingToken),
    unsubscribe_url: buildCmaUnsubscribeUrl(unsubToken),
    agent: agent ?? defaultAgentProfile(),
    hero_image_url: client.property_facts?.image_url ?? null,
  });

  // 8. Send.
  const sendResult = await sendCmaEmail(platformConn, {
    to: {
      email: client.email,
      name: clientFullName(client) ?? undefined,
    },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    reply_to: agent?.reply_to_email ?? undefined,
    headers: {
      "List-Unsubscribe": `<${buildCmaUnsubscribeUrl(unsubToken)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: {
      cma_delivery_id: delivery.id,
      trigger: triggerSource,
    },
  });

  // 9. Persist send outcome on the delivery row + bump client state.
  const now = new Date().toISOString();

  if (sendResult.success) {
    await supabase
      .from("cma_client_deliveries")
      .update({
        delivered_at: now,
        email_subject: rendered.subject,
        email_html: rendered.html,
        // ESP-side message id — webhook lookups index here.
        provider_message_id: sendResult.provider_message_id ?? null,
        send_error: null,
      })
      .eq("id", delivery.id);

    // Bump cadence state. cadence_days falls back to the agent's
    // default; agent default falls back to 90 (matches the
    // cma_agent_settings DEFAULT).
    const cadenceDays = await resolveCadenceDays(supabase, client);
    const nextDue = new Date();
    nextDue.setUTCDate(nextDue.getUTCDate() + cadenceDays);

    await supabase
      .from("cma_clients")
      .update({
        last_delivered_at: now,
        next_due_at: nextDue.toISOString(),
        delivered_count: client.delivered_count + 1,
        updated_at: now,
      })
      .eq("id", client.id);

    // Per-app last_send_at lives on app_email_connection_state.
    await updateAppEmailState(
      supabase,
      client.user_id,
      "listing_studio",
      platformConn.id,
      { lastSendAt: now, lastError: null },
    );

    // No monthly-counter bump — the dashboard reads
    // deliveries_sent / manual_sends live from cma_client_deliveries
    // now, so the delivery row insert above IS the increment.
  } else {
    const errorMsg = sendResult.error ?? "Unknown send error";
    await supabase
      .from("cma_client_deliveries")
      .update({
        send_error: errorMsg,
        email_subject: rendered.subject,
        email_html: rendered.html,
      })
      .eq("id", delivery.id);

    await updateAppEmailState(
      supabase,
      client.user_id,
      "listing_studio",
      platformConn.id,
      { lastError: errorMsg },
    );
  }

  return {
    success: sendResult.success,
    deliveryId: delivery.id,
    cmaRunId: cmaResult.cmaRunId,
    providerMessageId: sendResult.provider_message_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveCadenceDays(
  supabase: ReturnType<typeof createServiceRoleClient>,
  client: CmaClient,
): Promise<number> {
  if (client.cadence_days && client.cadence_days >= 7)
    return client.cadence_days;
  const { data } = await supabase
    .from("cma_agent_settings")
    .select("default_cadence_days")
    .eq("user_id", client.user_id)
    .maybeSingle();
  return data?.default_cadence_days ?? 90;
}

function clientFullName(c: CmaClient): string | null {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

/** Neutral placeholder when the agent has no platform_profile yet —
 *  the renderer reads optional fields so most will be null/undefined,
 *  but a few brand fields (primary_color, accent_color) need defaults. */
function defaultAgentProfile(): Pick<
  PlatformProfile,
  | "full_name"
  | "display_name"
  | "title"
  | "brokerage"
  | "phone"
  | "reply_to_email"
  | "physical_address"
  | "sign_off"
  | "license_number"
  | "license_info"
  | "legal_disclaimer"
  | "primary_color"
  | "accent_color"
  | "logo_url"
  | "headshot_url"
> {
  return {
    full_name: null,
    display_name: "Your agent",
    title: null,
    brokerage: null,
    phone: null,
    reply_to_email: null,
    physical_address: null,
    sign_off: null,
    license_number: null,
    license_info: null,
    legal_disclaimer: null,
    primary_color: "#1E293B",
    accent_color: "#D4A35C",
    logo_url: null,
    headshot_url: null,
  };
}
