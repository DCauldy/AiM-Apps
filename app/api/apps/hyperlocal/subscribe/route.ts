import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getHyperlocalPacks, getFeatureFlag } from "@/lib/admin-config.server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// POST /api/apps/hyperlocal/subscribe
// Body: { packId }
//
// Mirrors /api/apps/blog-engine/subscribe — looks up the requested
// pack, refuses if the user already has an active Hyperlocal
// subscription (manage via Settings instead), creates a Stripe
// Checkout session, returns the redirect URL.
//
// The actual hl_user_packs row is written by the Stripe webhook
// handler on `checkout.session.completed` / `customer.subscription.*`
// events — NOT here. This route only initiates checkout.
// ============================================================

export async function POST(req: NextRequest) {
  if (!(await getFeatureFlag("HYPERLOCAL"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { packId } = await req.json();
    const packs = await getHyperlocalPacks();
    const pack = packs.find((p) => p.id === packId);

    if (!pack) {
      return Response.json({ error: "Invalid pack" }, { status: 400 });
    }
    if (!pack.stripePriceId || pack.stripePriceId === "price_TODO") {
      return Response.json(
        {
          error:
            "This pack isn't connected to Stripe yet. Admin needs to set the Stripe Price ID under Admin → Packs.",
        },
        { status: 503 },
      );
    }

    // Already-subscribed check.
    const service = createServiceRoleClient();
    const { data: existing } = await service
      .from("hl_user_packs")
      .select("stripe_subscription_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      existing?.stripe_subscription_id &&
      existing.status !== "canceled"
    ) {
      return Response.json(
        {
          error:
            "You already have an active Hyperlocal subscription. Manage it in Settings.",
        },
        { status: 409 },
      );
    }

    const stripe = getStripe();
    const origin = req.headers.get("origin") || "http://localhost:6060";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: pack.stripePriceId, quantity: 1 }],
      metadata: {
        user_id: user.id,
        pack_id: pack.id,
        app: "hyperlocal",
      },
      success_url: `${origin}/apps/hyperlocal/settings?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/apps/hyperlocal/settings`,
    });

    return Response.json({ url: session.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[hyperlocal-subscribe] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
