import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { FEATURES } from "@/lib/feature-flags";
import { getStripe } from "@/lib/stripe";
import { getPackById } from "@/lib/prompt-packs";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Feature flag gate
  if (!FEATURES.PROMPT_PACKS) {
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

    // Verify user is an AiM member
    const serviceClient = createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .single();

    if (profile?.account_type !== "aim_member") {
      return Response.json(
        { error: "Prompt packs are available to AiM members only" },
        { status: 403 }
      );
    }

    const { packId } = await req.json();
    const pack = getPackById(packId);

    if (!pack) {
      return Response.json({ error: "Invalid pack" }, { status: 400 });
    }

    const stripe = getStripe();
    const origin = req.headers.get("origin") || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: pack.stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        pack_id: pack.id,
        pack_size: String(pack.size),
      },
      success_url: `${origin}/apps/prompt-studio/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/apps/prompt-studio/chat`,
    });

    return Response.json({ url: session.url });
  } catch (error: any) {
    console.error("[purchase-pack] error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
