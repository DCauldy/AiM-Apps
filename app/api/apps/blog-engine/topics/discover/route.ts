import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { discoverTopicsForUser } from "@/lib/blog-engine/discover-topics";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV === "development";

// POST /api/apps/blog-engine/topics/discover
//
// Manual topic-bank refill. Does NOT consume a weekly blog slot — only
// runs the cheap discover + score steps. The existing pipeline still
// performs discovery as a side effect when the bank is empty; this lets
// users top up proactively without having to trigger a full blog run.
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    if (isDev) {
      // Fire-and-forget — the topics page polls for the resulting "unused"
      // rows. Errors get logged but don't fail the request.
      discoverTopicsForUser(user.id).catch((err) => {
        console.error("[topics-discover] dev run failed:", err);
      });
      return Response.json({
        success: true,
        message: "Discovery started (dev mode)",
      });
    }

    await inngest.send({
      name: "blog-engine/topics.discover.requested",
      data: { userId: user.id },
    });

    return Response.json({
      success: true,
      message: "Discovery started",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
