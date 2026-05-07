import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/radar/manage-subscription
 * Create a Stripe customer portal session for managing the radar subscription.
 */
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Get Stripe customer ID from radar_config
    const { data: config } = await supabase
      .from("radar_config")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!config?.stripe_customer_id) {
      return Response.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://apps.aimarketingacademy.com";

    const session = await stripe.billingPortal.sessions.create({
      customer: config.stripe_customer_id,
      return_url: `${appUrl}/apps/radar/settings`,
    });

    return Response.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Radar manage-subscription API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
