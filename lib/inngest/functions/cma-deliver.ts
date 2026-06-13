import { inngest } from "@/lib/inngest/client";
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

// ---------------------------------------------------------------------------
// Event shape — fired by the cadence-tick fn AND the manual send-now route.
// ---------------------------------------------------------------------------

type CmaDeliverEvent = {
  name: "cma/deliver.requested";
  data: {
    /** cma_clients.id — the only required input. */
    clientId: string;
    /** "cadence" | "manual" | "first_enrollment" — written onto
     *  cma_client_deliveries.trigger_source for analytics. */
    triggerSource: "cadence" | "manual" | "first_enrollment";
    /** Optional explicit email connection override; falls back to the
     *  user's default cma_email_connections row. */
    emailConnectionId?: string;
  };
};

// ---------------------------------------------------------------------------
// Concurrency cap of 3 protects RapidAPI quota under burst (e.g. 100
// clients enrolled at once → 100 first-enrollment events firing in
// under a minute). Inngest serializes the rest. Retries are off
// because runCmaPipeline writes its own pipeline_error row + the
// delivery row stores send_error — duplicating those via retries
// would mask the real failure.
// ---------------------------------------------------------------------------

export const cmaDeliver = inngest.createFunction(
  {
    id: "cma-deliver",
    name: "CMA: deliver",
    retries: 0,
    concurrency: [{ limit: 3 }],
    triggers: [{ event: "cma/deliver.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: CmaDeliverEvent["data"]; id?: string };
    step: any;
  }) => {
    const { clientId, triggerSource, emailConnectionId } = event.data;
    const supabase = createServiceRoleClient();

    // 1. Load client + sanity-check enrollment.
    const client = await step.run("load-client", async () => {
      const { data, error } = await supabase
        .from("cma_clients")
        .select("*")
        .eq("id", clientId)
        .maybeSingle();
      if (error || !data) {
        throw new Error(
          `cma-deliver: client ${clientId} not found (${error?.message ?? "no row"})`,
        );
      }
      const c = data as CmaClient;
      if (c.unsubscribed_at) throw new Error("Client is unsubscribed");
      // Manual sends ignore the enrolled flag — agent explicitly asked.
      // Cadence + first_enrollment require it.
      if (triggerSource !== "manual" && !c.enrolled) {
        throw new Error("Client is not enrolled");
      }
      if (!c.address || !c.email) {
        throw new Error("Client is missing address or email");
      }
      return c;
    });

    // 2. Resolve sending connection — caller-specified or the agent's
    //    default for the CMA app. We need the platform row (auth blob)
    //    for the adapter and capture the platform connection id for the
    //    delivery row FK + per-app state updates.
    const emailConn = await step.run("load-email-connection", async () => {
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
      return {
        platform: platformConn,
        profile_id: joined.connection.profile_id,
      };
    });

    // 3. Resolve agent profile for signature + branding.
    const agent = await step.run("load-agent-profile", async () => {
      const targetProfileId = client.profile_id ?? emailConn.profile_id;
      const q = targetProfileId
        ? supabase.from("platform_profiles").select("*").eq("id", targetProfileId)
        : supabase
            .from("platform_profiles")
            .select("*")
            .eq("user_id", client.user_id)
            .eq("is_default", true);
      const { data } = await q.maybeSingle();
      // Profile is best-effort; the email renderer falls back to neutral
      // copy when fields are null.
      return (data ?? null) as PlatformProfile | null;
    });

    // Platform connection — used for adapter calls + delivery row FK.
    const platformConn: PlatformEmailConnection = emailConn.platform;

    // 4. Load prior delivery to compute the vs-last-CMA delta.
    const priorDelivery = await step.run("load-prior-delivery", async () => {
      const { data } = await supabase
        .from("cma_client_deliveries")
        .select("recommended_price_cents, estimated_value_cents, marketable_value_cents")
        .eq("client_id", client.id)
        .not("delivered_at", "is", null)
        .order("delivered_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    });

    // 5. Run the CMA pipeline.
    const cmaResult = await step.run("run-cma-pipeline", async () =>
      runCmaPipeline({
        address: client.address ?? "",
        subject: client.property_facts ?? {},
      }),
    );

    // 5b. Persist the zpid + image_url the pipeline backfilled onto
    //     the subject so the next render (landing page open, future
    //     preview, future delivery) doesn't re-fetch — and so the
    //     hero image actually shows up on this delivery's landing page
    //     instead of falling through to the Mapbox map.
    await step.run("persist-hydrated-subject", async () => {
      const merged = {
        ...(client.property_facts ?? {}),
        ...cmaResult.hydratedSubject,
      };
      await supabase
        .from("cma_clients")
        .update({
          property_facts: merged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", client.id);
      // Mutate locally so step 7's renderer sees the image_url.
      (client as { property_facts: typeof merged }).property_facts = merged;
    });

    // 6. Mint the landing-page token + unsubscribe token; persist the
    //    delivery row in `pending` state so the row exists before the
    //    ESP send attempts (engagement webhooks can correlate by token).
    const landingToken = generateLandingPageToken();
    const unsubToken = await generateCmaUnsubscribeToken(client.id);

    const delivery = await step.run("create-delivery-row", async () => {
      const { data, error } = await supabase
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
      if (error || !data) {
        throw new Error(`Failed to create delivery row: ${error?.message}`);
      }
      return data as CmaClientDelivery;
    });

    // 7. Render the email.
    const rendered = await step.run("render-email", async () => {
      const delta =
        priorDelivery && priorDelivery.recommended_price_cents
          ? {
              delta_since_last_cents:
                cmaResult.recommendedPriceCents - priorDelivery.recommended_price_cents,
              delta_since_last_pct:
                ((cmaResult.recommendedPriceCents -
                  priorDelivery.recommended_price_cents) /
                  priorDelivery.recommended_price_cents) *
                100,
            }
          : {};

      return renderCmaEmail({
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
    });

    // 8. Send.
    const sendResult = await step.run("send-email", async () => {
      return sendCmaEmail(platformConn, {
        to: {
          email: client.email!,
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
    });

    // 9. Persist send outcome on the delivery row + bump client state.
    await step.run("finalize-delivery", async () => {
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
        // default; agent default falls back to 90 (matches the cma_agent_settings DEFAULT).
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

        // Monthly meter — informational, distinguishes cadence vs manual.
        await supabase.rpc("cma_increment_delivery_count", {
          p_user_id: client.user_id,
          p_month_start: monthStart(now),
          p_is_manual: triggerSource === "manual",
        });
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
    });

    return {
      success: sendResult.success,
      deliveryId: delivery.id,
      cmaRunId: cmaResult.cmaRunId,
      providerMessageId: sendResult.provider_message_id,
    };
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveCadenceDays(
  supabase: ReturnType<typeof createServiceRoleClient>,
  client: CmaClient,
): Promise<number> {
  if (client.cadence_days && client.cadence_days >= 7) return client.cadence_days;
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

function monthStart(iso: string): string {
  const d = new Date(iso);
  const ms = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return ms.toISOString().split("T")[0];
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
