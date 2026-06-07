import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getBlogPacks, getRadarPacks } from "@/lib/admin-config.server";
import { getSlotProductId } from "@/lib/profiles/slot-billing";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

/**
 * Checks if the subscription is the Profile Slot add-on.
 *
 * Detection priority:
 *   1. Explicit subscription metadata.product === "profile_slot"
 *   2. Price.product matches the admin-configured slot product id
 */
async function isSlotSubscription(subscription: Stripe.Subscription): Promise<boolean> {
  if (subscription.metadata?.product === "profile_slot") return true;
  const productOnPrice = subscription.items.data[0]?.price?.product;
  if (!productOnPrice) return false;
  const slotProductId = await getSlotProductId();
  if (!slotProductId) return false;
  return (typeof productOnPrice === "string" ? productOnPrice : productOnPrice.id) === slotProductId;
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("[stripe-webhook] signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  // ── checkout.session.completed ──────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status !== "paid") {
      console.log("[stripe-webhook] session not paid, skipping:", session.id);
      return new Response("OK", { status: 200 });
    }

    const { user_id, pack_id, pack_size, pack_frequency } = session.metadata ?? {};

    // ── Blog Engine subscription ──────────────────────────────────────
    if (pack_id?.startsWith("blog_") && user_id && pack_frequency) {
      const frequency = parseInt(pack_frequency, 10);
      if (isNaN(frequency) || frequency < 4 || frequency > 7) {
        console.error("[stripe-webhook] invalid pack_frequency:", pack_frequency);
        return new Response("OK", { status: 200 });
      }

      const { getUserTierLabel } = await import("@/lib/blog-packs");
      const tierLabel = getUserTierLabel(frequency);
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as Stripe.Subscription | null)?.id;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : (session.customer as Stripe.Customer | null)?.id;

      // Update bofu_schedules with subscription info
      const { error: scheduleError } = await serviceClient
        .from("bofu_schedules")
        .update({
          frequency,
          frequency_tier: tierLabel.toLowerCase(),
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      if (scheduleError) {
        console.error("[stripe-webhook] failed to update schedule:", scheduleError.message);
      }

      console.log(
        `[stripe-webhook] Blog subscription activated: user=${user_id}, tier=${tierLabel}, frequency=${frequency}`
      );
      return new Response("OK", { status: 200 });
    }

    // ── Prompt Studio pack purchase ───────────────────────────────────
    if (pack_id?.startsWith("pack_") && user_id && pack_size) {
      const size = parseInt(pack_size, 10);
      if (isNaN(size) || size <= 0) {
        console.error("[stripe-webhook] invalid pack_size:", pack_size);
        return new Response("OK", { status: 200 });
      }

      await serviceClient.rpc("add_bonus_prompts", {
        p_user_id: user_id,
        p_amount: size,
      });

      await serviceClient.from("prompt_pack_purchases").insert({
        user_id,
        pack_size: size,
        price_cents: session.amount_total ?? 0,
        stripe_payment_id: (session.payment_intent as string) ?? session.id,
      });

      console.log(`[stripe-webhook] Added ${size} bonus prompts for user ${user_id}`);
      return new Response("OK", { status: 200 });
    }

    // ── Radar subscription ────────────────────────────────────────────
    if (pack_id?.startsWith("radar_") && user_id) {
      const { getRadarPackById } = await import("@/lib/radar-packs");
      const radarPack = getRadarPackById(pack_id);
      if (!radarPack) {
        console.error("[stripe-webhook] unknown radar pack:", pack_id);
        return new Response("OK", { status: 200 });
      }

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as Stripe.Subscription | null)?.id;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : (session.customer as Stripe.Customer | null)?.id;

      const { error: radarError } = await serviceClient
        .from("radar_config")
        .update({
          tier: radarPack.tier.toLowerCase(),
          query_limit: radarPack.queryLimit,
          manual_checks_limit: radarPack.manualChecksLimit,
          audits_limit: radarPack.auditsLimit,
          monitoring_frequency: radarPack.monitoringFrequency,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      if (radarError) {
        console.error("[stripe-webhook] failed to update radar_config:", radarError.message);
      }

      console.log(
        `[stripe-webhook] Radar subscription activated: user=${user_id}, tier=${radarPack.tier}`
      );
      return new Response("OK", { status: 200 });
    }

    // ── Profile Slot subscription ─────────────────────────────────────
    if (session.metadata?.product === "profile_slot") {
      const slotUserId = session.metadata.supabase_user_id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (!slotUserId || !subscriptionId) {
        console.error("[stripe-webhook] slot checkout missing user_id or subscription:", session.id);
        return new Response("OK", { status: 200 });
      }

      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const quantity = sub.items.data[0]?.quantity ?? 1;

      const { error: slotError } = await serviceClient
        .from("profiles")
        .update({
          slot_stripe_subscription_id: subscriptionId,
          profile_slot_count: 1 + quantity,
          slot_grace_period_ends_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", slotUserId);

      if (slotError) {
        console.error("[stripe-webhook] failed to update slot count:", slotError.message);
      }
      console.log(`[stripe-webhook] Slot subscription activated: user=${slotUserId}, slots=${1 + quantity}`);
      return new Response("OK", { status: 200 });
    }

    // Unknown metadata — log and skip
    if (!user_id) {
      console.error("[stripe-webhook] missing user_id metadata on session:", session.id);
    }
    return new Response("OK", { status: 200 });
  }

  // ── customer.subscription.updated ───────────────────────────────────
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : (subscription.customer as Stripe.Customer).id;

    // ── Profile Slot subscription updated ─────────────────────────────
    if (await isSlotSubscription(subscription)) {
      const quantity = subscription.items.data[0]?.quantity ?? 1;
      const isActive = subscription.status === "active" || subscription.status === "trialing";
      const cancelingAtPeriodEnd = subscription.cancel_at_period_end;

      // While active and not winding down → slots are 1 (included) + quantity.
      // Winding down or any non-active status → leave slots as-is but set grace.
      const newSlots = isActive && !cancelingAtPeriodEnd ? 1 + quantity : null;
      const graceEnd = cancelingAtPeriodEnd
        ? new Date(((subscription as unknown as { current_period_end?: number }).current_period_end ?? 0) * 1000).toISOString()
        : null;

      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (newSlots !== null) update.profile_slot_count = newSlots;
      if (graceEnd) update.slot_grace_period_ends_at = graceEnd;
      else if (isActive && !cancelingAtPeriodEnd) update.slot_grace_period_ends_at = null;

      await serviceClient
        .from("profiles")
        .update(update)
        .eq("stripe_customer_id", customerId);

      console.log(
        `[stripe-webhook] Slot subscription updated: customer=${customerId}, slots=${newSlots ?? "unchanged"}, grace=${graceEnd ?? "cleared"}`
      );
      return new Response("OK", { status: 200 });
    }

    // Get the current price from the subscription
    const priceId = subscription.items.data[0]?.price?.id;
    if (!priceId) {
      console.log("[stripe-webhook] subscription.updated: no price found, skipping");
      return new Response("OK", { status: 200 });
    }

    const blogPacks = await getBlogPacks();
    const pack = blogPacks.find((p) => p.stripePriceId === priceId);

    if (pack) {
      const { getUserTierLabel } = await import("@/lib/blog-packs");

      if (subscription.status === "active") {
        await serviceClient
          .from("bofu_schedules")
          .update({
            frequency: pack.frequency,
            frequency_tier: getUserTierLabel(pack.frequency).toLowerCase(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        console.log(
          `[stripe-webhook] Blog subscription updated: customer=${customerId}, frequency=${pack.frequency}`
        );
      }
      return new Response("OK", { status: 200 });
    }

    // Check if this is a Radar subscription
    const radarPacks = await getRadarPacks();
    const radarPack = radarPacks.find((p) => p.stripePriceId === priceId);

    if (radarPack && subscription.status === "active") {
      await serviceClient
        .from("radar_config")
        .update({
          tier: radarPack.tier.toLowerCase(),
          query_limit: radarPack.queryLimit,
          manual_checks_limit: radarPack.manualChecksLimit,
          audits_limit: radarPack.auditsLimit,
          monitoring_frequency: radarPack.monitoringFrequency,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);

      console.log(
        `[stripe-webhook] Radar subscription updated: customer=${customerId}, tier=${radarPack.tier}`
      );
    }

    return new Response("OK", { status: 200 });
  }

  // ── customer.subscription.deleted ───────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : (subscription.customer as Stripe.Customer).id;

    // ── Profile Slot subscription canceled (after grace) ──────────────
    if (await isSlotSubscription(subscription)) {
      await serviceClient
        .from("profiles")
        .update({
          slot_stripe_subscription_id: null,
          profile_slot_count: 1,
          slot_grace_period_ends_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);
      console.log(`[stripe-webhook] Slot subscription deleted: customer=${customerId}, slots reset to 1`);
      return new Response("OK", { status: 200 });
    }

    // Check if this is a blog engine subscription by looking up the customer
    const { data: schedule } = await serviceClient
      .from("bofu_schedules")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (schedule) {
      await serviceClient
        .from("bofu_schedules")
        .update({
          frequency: 3,
          frequency_tier: "free",
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);

      console.log(
        `[stripe-webhook] Blog subscription cancelled: customer=${customerId}, frequency reset to 3`
      );
      return new Response("OK", { status: 200 });
    }

    // Check if this is a Radar subscription cancellation
    const { data: radarConfig } = await serviceClient
      .from("radar_config")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (radarConfig) {
      await serviceClient
        .from("radar_config")
        .update({
          tier: "pro",
          query_limit: 25,
          manual_checks_limit: 0,
          audits_limit: 1,
          monitoring_frequency: "monthly",
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);

      console.log(
        `[stripe-webhook] Radar subscription cancelled: customer=${customerId}, reset to pro baseline`
      );
    }

    return new Response("OK", { status: 200 });
  }

  return new Response("OK", { status: 200 });
}
