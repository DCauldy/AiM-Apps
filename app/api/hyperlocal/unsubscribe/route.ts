import { verifyUnsubscribeToken } from "@/lib/hyperlocal/email/unsubscribe";
import { addSuppression } from "@/lib/hyperlocal/email/suppressions";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public unsubscribe endpoint — no auth.
 *
 * GET  /api/hyperlocal/unsubscribe?token=...  → HTML landing page (auto-confirms for one-click)
 * POST /api/hyperlocal/unsubscribe            → form submit; body { token } or List-Unsubscribe-Post
 */

function renderPage(opts: {
  title: string;
  message: string;
  email?: string;
}): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title}</title>
  <style>
    body { margin:0; padding:40px 20px; background:#f5f5f5; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:#1a1a1a; }
    .card { max-width:480px; margin:0 auto; background:#fff; border-radius:8px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
    h1 { margin:0 0 16px; font-size:22px; }
    p { margin:0 0 12px; line-height:1.5; color:#444; }
    .email { font-family:monospace; background:#f0f0f0; padding:2px 6px; border-radius:3px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${opts.title}</h1>
    <p>${opts.message}</p>
    ${opts.email ? `<p>Suppressed: <span class="email">${opts.email}</span></p>` : ""}
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function unsubscribeFromToken(token: string): Promise<{
  ok: boolean;
  email?: string;
  error?: string;
}> {
  const verified = await verifyUnsubscribeToken(token);
  if (!verified) {
    return { ok: false, error: "Invalid or expired link" };
  }
  await addSuppression({
    userId: verified.userId,
    email: verified.email,
    reason: "unsubscribed",
  });
  return { ok: true, email: verified.email };
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return renderPage({
      title: "Unsubscribe link invalid",
      message: "This link is missing required information.",
    });
  }
  const result = await unsubscribeFromToken(token);
  if (!result.ok) {
    return renderPage({
      title: "Couldn't process",
      message: result.error ?? "The unsubscribe link is invalid or expired.",
    });
  }
  return renderPage({
    title: "You've been unsubscribed",
    message:
      "We won't send any more hyperlocal market updates to this address. If this was a mistake, reply to one of our messages and we'll get it sorted.",
    email: result.email,
  });
}

/**
 * One-click compliance (RFC 8058) — Gmail/Yahoo POST here with no body.
 * The token lives in the URL.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  let token = url.searchParams.get("token");

  // Some clients send form data
  if (!token) {
    try {
      const form = await req.formData();
      const v = form.get("token");
      if (typeof v === "string") token = v;
    } catch {
      // No body
    }
  }

  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await unsubscribeFromToken(token);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ success: true, email: result.email });
}
