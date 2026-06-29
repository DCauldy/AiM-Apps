import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyCmaUnsubscribeToken } from "@/lib/listing-studio/email/unsubscribe";

export const dynamic = "force-dynamic";

const HTML_HEAD = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed</title>
<style>
  body{margin:0;background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;max-width:480px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.35);}
  h1{margin:0 0 8px 0;font-size:20px;color:#f8fafc;}
  p{margin:0;color:#94a3b8;font-size:14px;line-height:1.5;}
  .accent{color:#D4A35C;}
</style></head><body>`;
const HTML_FOOT = `</body></html>`;

/**
 * GET /api/cma/unsubscribe?token=<jwt>
 *
 * One-click unsubscribe per CAN-SPAM. Sets cma_clients.unsubscribed_at
 * (also flips paused so the cadence-tick partial index excludes the
 * row from the next scan). Idempotent — re-clicking renders the same
 * confirmation page.
 *
 * GET is the standard for List-Unsubscribe links AND survives email
 * clients that prefetch links for safety scanning. We accept POST as
 * well for List-Unsubscribe-Post=One-Click compliance.
 */
export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return htmlResponse(
      `<div class="card"><h1>Invalid link</h1><p>This unsubscribe link is missing its token. Reach out to your agent if you want off the list.</p></div>`,
      400,
    );
  }

  const payload = await verifyCmaUnsubscribeToken(token);
  if (!payload) {
    return htmlResponse(
      `<div class="card"><h1>Link expired or invalid</h1><p>Unsubscribe links expire after a year. Reply to your most recent CMA email and we'll handle it manually.</p></div>`,
      400,
    );
  }

  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  // Set unsubscribed_at + paused so:
  //   1. cma_clients_due_idx (partial index on unsubscribed_at IS NULL)
  //      excludes the row from the next cadence scan
  //   2. paused = true makes it explicit in the agent's UI
  await supabase
    .from("cma_clients")
    .update({
      unsubscribed_at: now,
      paused: true,
      updated_at: now,
    })
    .eq("id", payload.clientId)
    .is("unsubscribed_at", null);

  return htmlResponse(
    `<div class="card"><h1>You're unsubscribed</h1><p>We've stopped sending you quarterly CMAs from this agent. No further action needed.</p></div>`,
    200,
  );
}

function htmlResponse(body: string, status: number): Response {
  return new Response(HTML_HEAD + body + HTML_FOOT, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
