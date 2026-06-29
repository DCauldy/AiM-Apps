import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await getFeatureFlag("BLOG_ENGINE"))) {
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

    const serviceClient = createServiceRoleClient();
    const { data: schedule } = await serviceClient
      .from("bofu_schedules")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!schedule?.stripe_customer_id) {
      return Response.json(
        { error: "No active subscription found" },
        { status: 404 }
      );
    }

    const stripe = getStripe();
    const origin = req.headers.get("origin") || "http://localhost:6060";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: schedule.stripe_customer_id,
      return_url: `${origin}/apps/blog-engine/settings`,
    });

    return Response.json({ url: portalSession.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[blog-manage-subscription] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
