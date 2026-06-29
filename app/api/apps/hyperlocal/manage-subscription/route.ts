import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Mirrors /api/apps/blog-engine/manage-subscription. Looks up the user's
// hl_user_packs row, requires a stripe_customer_id, and creates a Stripe
// billing portal session so the user can change card / cancel / swap pack.
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

    const service = createServiceRoleClient();
    const { data: userPack } = await service
      .from("hl_user_packs")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!userPack?.stripe_customer_id) {
      return Response.json(
        { error: "No active subscription found" },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const origin = req.headers.get("origin") || "http://localhost:6060";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: userPack.stripe_customer_id,
      return_url: `${origin}/apps/hyperlocal/settings?tab=upgrade`,
    });

    return Response.json({ url: portalSession.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[hyperlocal-manage-subscription] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
