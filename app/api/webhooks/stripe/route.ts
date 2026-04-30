import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only process paid sessions
    if (session.payment_status !== "paid") {
      console.log("[stripe-webhook] session not paid, skipping:", session.id);
      return new Response("OK", { status: 200 });
    }

    const { user_id, pack_id, pack_size } = session.metadata ?? {};

    if (!user_id || !pack_size) {
      console.error("[stripe-webhook] missing metadata on session:", session.id);
      return new Response("OK", { status: 200 });
    }

    const size = parseInt(pack_size, 10);
    if (isNaN(size) || size <= 0) {
      console.error("[stripe-webhook] invalid pack_size:", pack_size);
      return new Response("OK", { status: 200 });
    }

    const serviceClient = createServiceRoleClient();

    // Add bonus prompts to user
    await serviceClient.rpc("add_bonus_prompts", {
      p_user_id: user_id,
      p_amount: size,
    });

    // Record the purchase
    await serviceClient.from("prompt_pack_purchases").insert({
      user_id,
      pack_size: size,
      price_cents: session.amount_total ?? 0,
      stripe_payment_id: session.payment_intent as string ?? session.id,
    });

    console.log(`[stripe-webhook] Added ${size} bonus prompts for user ${user_id}`);
  }

  return new Response("OK", { status: 200 });
}
