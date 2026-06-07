import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import {
  getActiveSlotPrice,
  ensureStripeCustomer,
} from "@/lib/profiles/slot-billing";

export const dynamic = "force-dynamic";

/**
 * POST /api/profiles/slots/checkout
 *
 * Creates a Stripe Checkout session for one additional Profile Slot. On
 * success, redirects the browser to Stripe-hosted checkout. The
 * customer.subscription.created webhook lands the slot count update once
 * Stripe confirms the subscription, so we do not optimistically grant slots.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.email) {
    return Response.json({ error: "Account is missing an email address" }, { status: 400 });
  }

  const price = await getActiveSlotPrice();
  if (!price) {
    return Response.json(
      { error: "Profile Slot product is not configured. Contact an admin." },
      { status: 500 }
    );
  }

  const customerId = await ensureStripeCustomer(user.id, user.email);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:6060";

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    // Promo codes intentionally disabled — slot pricing is fixed annual.
    allow_promotion_codes: false,
    success_url: `${baseUrl}/account?slot_purchase=success`,
    cancel_url: `${baseUrl}/account?slot_purchase=canceled`,
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        product: "profile_slot",
      },
    },
    metadata: {
      supabase_user_id: user.id,
      product: "profile_slot",
    },
  });

  return Response.json({ url: session.url });
}
