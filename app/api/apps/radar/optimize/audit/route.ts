import "server-only";

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createContentCheck,
  createCrawlabilityCheck,
} from "@/lib/radar-otterly/accessors";
import { OtterlyApiError } from "@/lib/radar-otterly/client";

export const dynamic = "force-dynamic";

interface AuditRunBody {
  type?: "content" | "crawlability";
  workspaceId?: string;
  url?: string;
  /** Content-check only — which AI crawler identity to fetch as. */
  crawlerIdentity?:
    | "ChatGPT-User"
    | "OAI-SearchBot"
    | "PerplexityCrawler"
    | "GoogleBot";
}

/**
 * POST /api/apps/radar/optimize/audit
 *
 * Fires a new Otterly audit (content check OR crawlability check)
 * on the supplied URL within the supplied workspace. Returns the
 * created audit's ID + initial status; the Optimize tab refreshes
 * its list to surface the new row, which polls for completion.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as AuditRunBody;
  const type = body.type;
  const workspaceId = body.workspaceId?.trim();
  const url = body.url?.trim();

  if (type !== "content" && type !== "crawlability") {
    return Response.json(
      { error: "type must be 'content' or 'crawlability'" },
      { status: 400 },
    );
  }
  if (!workspaceId) {
    return Response.json({ error: "workspaceId is required" }, { status: 400 });
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    return Response.json(
      { error: "url must start with http:// or https://" },
      { status: 400 },
    );
  }

  try {
    const audit =
      type === "content"
        ? await createContentCheck({
            workspaceId,
            url,
            crawlerIdentity: body.crawlerIdentity,
          })
        : await createCrawlabilityCheck({ workspaceId, url });
    return Response.json({ status: "created", audit });
  } catch (e) {
    if (e instanceof OtterlyApiError) {
      return Response.json(
        {
          status: "otterly_error",
          error: { message: e.message, status: e.status, body: e.body },
        },
        { status: 200 },
      );
    }
    return Response.json(
      {
        status: "otterly_error",
        error: {
          message: e instanceof Error ? e.message : "Unknown error",
          status: 500,
        },
      },
      { status: 200 },
    );
  }
}
