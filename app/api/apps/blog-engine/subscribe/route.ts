import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getBlogPacks } from "@/lib/admin-config.server";
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

    const { packId } = await req.json();
    const packs = await getBlogPacks();
    const pack = packs.find((p) => p.id === packId);

    if (!pack) {
      return Response.json({ error: "Invalid pack" }, { status: 400 });
    }

    // Check if user already has an active subscription
    const serviceClient = createServiceRoleClient();
    const { data: schedule } = await serviceClient
      .from("bofu_schedules")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (schedule?.stripe_subscription_id) {
      return Response.json(
        { error: "You already have an active subscription. Manage it in Settings." },
        { status: 409 }
      );
    }

    const stripe = getStripe();
    const origin = req.headers.get("origin") || "http://localhost:6060";

    const session = await stripe.checkout.sessions.create({
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
        pack_frequency: String(pack.frequency),
      },
      success_url: `${origin}/apps/blog-engine/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/apps/blog-engine/settings`,
    });

    return Response.json({ url: session.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[blog-subscribe] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
