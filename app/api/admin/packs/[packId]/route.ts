import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "tier",
  "size",
  "frequency",
  "price_cents",
  "stripe_price_id",
  "stripe_product_id",
  "label",
  "best_value",
  "is_active",
  "sort_order",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { packId } = await params;
  const body = await req.json();

  // Whitelist allowed fields
  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  // Read current pack to detect price changes
  const { data: currentPack, error: fetchError } = await serviceClient
    .from("admin_pack_configs")
    .select("*")
    .eq("id", packId)
    .single();

  if (fetchError || !currentPack) {
    return Response.json({ error: "Pack not found" }, { status: 404 });
  }

  // Determine if price sync is needed
  const newPriceCents = updates.price_cents as number | undefined;
  const priceChanged =
    newPriceCents !== undefined &&
    (newPriceCents !== currentPack.price_cents ||
      currentPack.stripe_price_id === "price_TODO");

  if (priceChanged) {
    try {
      const stripe = getStripe();

      // Ensure Stripe Product exists
      let productId: string = currentPack.stripe_product_id;

      if (!productId) {
        const product = await stripe.products.create({
          name: `${currentPack.tier} — ${currentPack.label}`,
          metadata: { pack_id: packId },
        });
        productId = product.id;
      }

      // Create new Stripe Price
      const priceParams: {
        product: string;
        unit_amount: number;
        currency: string;
        recurring?: { interval: "month" };
      } = {
        product: productId,
        unit_amount: newPriceCents,
        currency: "usd",
      };

      if (currentPack.app === "blog_engine") {
        priceParams.recurring = { interval: "month" };
      }

      const newPrice = await stripe.prices.create(priceParams);

      // Archive old Price if it's a real Stripe ID
      const oldPriceId = currentPack.stripe_price_id;
      if (oldPriceId && oldPriceId !== "price_TODO") {
        await stripe.prices.update(oldPriceId, { active: false });
      }

      // Override updates with synced values
      updates.stripe_price_id = newPrice.id;
      updates.stripe_product_id = productId;
    } catch (stripeError) {
      console.error("Stripe sync failed:", stripeError);
      return Response.json(
        { error: "Failed to sync price with Stripe" },
        { status: 502 }
      );
    }
  }

  updates.updated_at = new Date().toISOString();
  updates.updated_by = user.id;

  const { data, error } = await serviceClient
    .from("admin_pack_configs")
    .update(updates)
    .eq("id", packId)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Pack not found" }, { status: 404 });
  }

  return Response.json(data);
}
