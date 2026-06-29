import { tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import type { blogTopicsDiscoverTask } from "@/triggers/blog-engine";

export const dynamic = "force-dynamic";

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

    await tasks.trigger<typeof blogTopicsDiscoverTask>(
      "blog-engine-topics-discover",
      { userId: user.id },
    );

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
