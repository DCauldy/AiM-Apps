import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getRadarPackById } from "@/lib/radar-packs";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/radar/subscribe
 * Create a Stripe checkout session for a radar pack upgrade.
 * Body: { packId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { packId } = body;

    if (!packId || typeof packId !== "string") {
      return Response.json(
        { error: "packId is required" },
        { status: 400 }
      );
    }

    const pack = getRadarPackById(packId);
    if (!pack) {
      return Response.json(
        { error: "Invalid pack ID" },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    const serviceClient = createServiceRoleClient();
    const { data: config } = await serviceClient
      .from("radar_config")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const stripe = getStripe();
    let customerId = config?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      // Save customer ID
      await serviceClient
        .from("radar_config")
        .update({
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://apps.aimarketingacademy.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: pack.stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        pack_id: pack.id,
        radar_tier: pack.tier,
      },
      success_url: `${appUrl}/apps/radar/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/apps/radar/settings`,
    });

    return Response.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Radar subscribe API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
