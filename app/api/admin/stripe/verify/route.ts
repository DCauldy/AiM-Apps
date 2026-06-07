import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/stripe/verify
 *
 * Body: { productId: string }
 *
 * Looks up the Stripe Product by ID, lists its active recurring prices,
 * and returns a summary so admins can confirm they pasted the right ID
 * before saving. Read-only against Stripe; does not mutate admin_settings.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId } = (await req.json()) as { productId?: string };
  if (!productId || typeof productId !== "string") {
    return Response.json({ error: "productId is required" }, { status: 400 });
  }

  const stripe = getStripe();
  try {
    const product = await stripe.products.retrieve(productId);
    const prices = await stripe.prices.list({ product: productId, active: true, limit: 10 });

    return Response.json({
      ok: true,
      product: {
        id: product.id,
        name: product.name,
        active: product.active,
        description: product.description,
      },
      prices: prices.data.map((p) => ({
        id: p.id,
        amountCents: p.unit_amount,
        currency: p.currency,
        interval: p.recurring?.interval ?? null,
        intervalCount: p.recurring?.interval_count ?? null,
        nickname: p.nickname,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe lookup failed";
    return Response.json({ ok: false, error: message }, { status: 200 });
  }
}
