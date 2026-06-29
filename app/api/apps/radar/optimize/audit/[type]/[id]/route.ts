import "server-only";

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getContentCheck,
  getCrawlabilityCheck,
} from "@/lib/radar-otterly/accessors";
import { OtterlyApiError } from "@/lib/radar-otterly/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/radar/optimize/audit/[type]/[id]
 *
 * Fetches a single audit by ID. type is "content" or "crawlability".
 * Polled by the Optimize tab when a row expands AND repeatedly while
 * the audit is still "pending" / "running" so the UI flips to the
 * populated detail view the moment it completes.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (type !== "content" && type !== "crawlability") {
    return Response.json({ error: "invalid type" }, { status: 400 });
  }

  try {
    const audit =
      type === "content"
        ? await getContentCheck(id)
        : await getCrawlabilityCheck(id);
    return Response.json({ status: "ready", audit });
  } catch (e) {
    if (e instanceof OtterlyApiError) {
      return Response.json({
        status: "otterly_error",
        error: { message: e.message, status: e.status },
      });
    }
    return Response.json({
      status: "otterly_error",
      error: {
        message: e instanceof Error ? e.message : "Unknown error",
        status: 500,
      },
    });
  }
}
