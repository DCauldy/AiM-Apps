import { createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

/**
 * Helpers for the Profile Slot subscription product.
 *
 * The product reference (Stripe product_id) is stored in admin_settings so
 * admins can rotate it without redeploys. The active Price attached to the
 * product is resolved at runtime — Stripe Checkout requires a price_id, and
 * looking it up dynamically means an admin can rotate the price (renew
 * pricing, currency variant) without code changes.
 */

const SLOT_PRODUCT_KEY = "stripe_profile_slot_product_id";

let cachedPrice: { productId: string; price: Stripe.Price } | null = null;

/** Returns the Stripe Product ID configured in admin_settings, or null if unset. */
export async function getSlotProductId(): Promise<string | null> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("admin_settings")
    .select("value")
    .eq("key", SLOT_PRODUCT_KEY)
    .maybeSingle();
  return data?.value ?? null;
}

/**
 * Resolves the active recurring Price for the slot product.
 *
 * If the product has multiple active recurring prices, prefers a yearly
 * interval (since the slot is sold annually). Caches the result per process.
 */
export async function getActiveSlotPrice(): Promise<Stripe.Price | null> {
  const productId = await getSlotProductId();
  if (!productId) return null;

  if (cachedPrice && cachedPrice.productId === productId) {
    return cachedPrice.price;
  }

  const stripe = getStripe();
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 10,
  });

  if (prices.data.length === 0) return null;

  // Prefer yearly recurring; fall back to whatever active recurring price exists.
  const yearly = prices.data.find(
    (p) => p.recurring && p.recurring.interval === "year"
  );
  const choice = yearly ?? prices.data.find((p) => p.recurring) ?? prices.data[0];

  cachedPrice = { productId, price: choice };
  return choice;
}

/** Clears the in-process price cache. Called after the admin saves a new product ID. */
export function invalidateSlotPriceCache(): void {
  cachedPrice = null;
}

/** Stripe customer lookup or creation, keyed by Supabase user.id. */
export async function ensureStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  const service = createServiceRoleClient();
  const { data: profile } = await service
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  const existing = (profile as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (existing) return existing;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });

  await service
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}
