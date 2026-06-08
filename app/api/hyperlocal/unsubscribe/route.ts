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

type PageAction =
  | { kind: "resubscribe"; token: string }
  | { kind: "close" };

function renderPage(opts: {
  title: string;
  message: string;
  email?: string;
  status?: "ok" | "error";
  actions?: PageAction[];
}): Response {
  const status = opts.status ?? "ok";
  const dotColor = status === "ok" ? "#31DBA5" : "#F43F5E";
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>${escapeHtml(opts.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
  <style>
    :root {
      --bg: #0b1018;
      --bg-2: #11182a;
      --fg: #e6edf3;
      --fg-muted: rgba(230, 237, 243, 0.6);
      --fg-faint: rgba(230, 237, 243, 0.4);
      --aim-blue: #1C4C8A;
      --aim-green: #31DBA5;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--fg);
      background:
        radial-gradient(ellipse at 20% 0%, rgba(28, 76, 138, 0.25) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 100%, rgba(49, 219, 165, 0.18) 0%, transparent 50%),
        var(--bg);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 480px;
      background: rgba(17, 24, 42, 0.65);
      backdrop-filter: blur(20px) saturate(140%);
      -webkit-backdrop-filter: blur(20px) saturate(140%);
      border: 1px solid rgba(49, 219, 165, 0.2);
      border-radius: 20px;
      overflow: hidden;
      box-shadow:
        0 30px 80px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.04) inset;
    }
    .header {
      padding: 28px 28px 20px;
      background: linear-gradient(135deg, rgba(28, 76, 138, 0.18) 0%, rgba(49, 219, 165, 0.12) 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .brand img {
      height: 28px;
      width: auto;
      display: block;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(49, 219, 165, 0.12);
      color: #31DBA5;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.01em;
    }
    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: ${dotColor};
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.9); }
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.25;
    }
    .body {
      padding: 22px 28px 28px;
    }
    p {
      margin: 0 0 14px;
      line-height: 1.55;
      color: var(--fg-muted);
      font-size: 14px;
    }
    p:last-child { margin-bottom: 0; }
    .email-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--fg);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 22px;
    }
    .btn {
      flex: 1;
      min-width: 140px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px 16px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s ease, transform 0.05s ease, background 0.15s ease;
      text-decoration: none;
    }
    .btn:active { transform: translateY(1px); }
    .btn-primary {
      color: #ffffff;
      background: linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%);
      box-shadow: 0 6px 18px rgba(49, 219, 165, 0.18);
    }
    .btn-primary:hover { opacity: 0.92; }
    .btn-secondary {
      color: var(--fg-muted);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .btn-secondary:hover {
      color: var(--fg);
      background: rgba(255, 255, 255, 0.07);
    }
    .footer {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 11px;
      color: var(--fg-faint);
      letter-spacing: 0.01em;
    }
  </style>
  <script>
    function closeTab() {
      // Browsers only allow window.close() on tabs opened by script —
      // for direct visits this silently no-ops. We show a tiny hint when
      // that happens so the user knows nothing went wrong.
      const before = Date.now();
      window.close();
      setTimeout(function() {
        if (Date.now() - before < 250) {
          const hint = document.getElementById('close-hint');
          if (hint) hint.style.display = 'block';
        }
      }, 50);
    }

    async function doResubscribe(btn, token) {
      // credentials: 'omit' so the request goes out with NO cookies — the
      // user's session cookies alone can exceed Next's dev-server header
      // size limit (HTTP 431) once you stack Supabase auth + app state.
      // Real recipients aren't logged in, but the agent testing their own
      // link is — this keeps both flows working.
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Resubscribing…';
      try {
        const body = new URLSearchParams();
        body.set('action', 'resubscribe');
        body.set('token', token);
        const res = await fetch('/api/hyperlocal/unsubscribe', {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
          body: body.toString(),
        });
        const json = await res.json().catch(function() { return {}; });
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Resubscribe failed');
        }
        document.getElementById('title').textContent = 'Welcome back';
        document.getElementById('message').textContent =
          "You're on the list again. You'll start receiving hyperlocal market updates with the next send.";
        const actions = document.getElementById('actions');
        if (actions) {
          actions.innerHTML =
            '<button type="button" class="btn btn-secondary" onclick="closeTab()" style="flex:1;">Close tab</button>';
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = original;
        document.getElementById('error-hint').textContent =
          (e && e.message) ? e.message : 'Something went wrong.';
        document.getElementById('error-hint').style.display = 'block';
      }
    }
  </script>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">
        <img src="/logo-dark.svg" alt="AiM" />
        <span class="badge">
          <span class="badge-dot"></span>
          AiM Automations
        </span>
      </div>
      <h1 id="title">${escapeHtml(opts.title)}</h1>
    </div>
    <div class="body">
      <p id="message">${escapeHtml(opts.message)}</p>
      ${
        opts.email
          ? `<p>Address: <span class="email-chip">${escapeHtml(opts.email)}</span></p>`
          : ""
      }
      <div id="actions">${renderActionsInner(opts.actions)}</div>
      <p id="close-hint" style="display:none;margin-top:14px;font-size:11px;color:var(--fg-faint);">
        Your browser blocked closing this tab automatically — go ahead and close it manually.
      </p>
      <p id="error-hint" style="display:none;margin-top:14px;font-size:12px;color:#F43F5E;"></p>
      <div class="footer">Hyperlocal · powered by Ai Marketing Academy</div>
    </div>
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderActionsInner(actions: PageAction[] | undefined): string {
  if (!actions || actions.length === 0) return "";
  const escapeAttr = (s: string) => s.replace(/"/g, "&quot;");
  const buttons = actions
    .map((a) => {
      if (a.kind === "resubscribe") {
        // Client-side fetch with credentials:'omit' — see <script> above for
        // why (Next.js dev returns HTTP 431 when session cookies stack with
        // the JWT-bearing request).
        return `<button type="button" class="btn btn-primary" style="flex:1;" onclick="doResubscribe(this, '${escapeAttr(a.token)}')">My mistake, resubscribe</button>`;
      }
      return `<button type="button" class="btn btn-secondary" style="flex:1;" onclick="closeTab()">Close tab</button>`;
    })
    .join("");
  return `<div class="actions">${buttons}</div>`;
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

async function resubscribeFromToken(token: string): Promise<{
  ok: boolean;
  email?: string;
  error?: string;
}> {
  const verified = await verifyUnsubscribeToken(token);
  if (!verified) {
    return { ok: false, error: "Invalid or expired link" };
  }
  const { removeSuppression } = await import("@/lib/hyperlocal/email/suppressions");
  await removeSuppression(verified.userId, verified.email);
  return { ok: true, email: verified.email };
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return renderPage({
      status: "error",
      title: "Link not valid",
      message: "This unsubscribe link is missing required information.",
      actions: [{ kind: "close" }],
    });
  }
  const result = await unsubscribeFromToken(token);
  if (!result.ok) {
    return renderPage({
      status: "error",
      title: "Couldn't process",
      message: result.error ?? "This unsubscribe link is invalid or expired.",
      actions: [{ kind: "close" }],
    });
  }
  return renderPage({
    title: "You're off the list",
    message:
      "We won't send any more hyperlocal market updates to this address. Changed your mind? Resubscribe below.",
    email: result.email,
    actions: [{ kind: "resubscribe", token }, { kind: "close" }],
  });
}

/**
 * Two POST flows live here:
 *
 *   1. action=resubscribe   → reverses the suppression and renders the
 *                              "Welcome back" confirmation page. Triggered
 *                              by the "My mistake, resubscribe" button.
 *   2. (no action)          → RFC 8058 one-click unsubscribe — Gmail/Yahoo
 *                              POST here with no body when the user uses
 *                              the inbox-level Unsubscribe button. Returns
 *                              JSON, not HTML, per the spec.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  let action = url.searchParams.get("action");
  let token = url.searchParams.get("token");

  // Body fields take precedence over query params — the form-driven
  // resubscribe flow now sends both in the body to avoid HTTP 431 from
  // a long JWT in the URL combined with the user's session cookies.
  if (!token || !action) {
    try {
      const form = await req.formData();
      if (!token) {
        const v = form.get("token");
        if (typeof v === "string") token = v;
      }
      if (!action) {
        const a = form.get("action");
        if (typeof a === "string") action = a;
      }
    } catch {
      // No body — RFC 8058 one-click path
    }
  }

  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  if (action === "resubscribe") {
    const result = await resubscribeFromToken(token);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ success: true, email: result.email });
  }

  // RFC 8058 one-click unsubscribe — Gmail/Yahoo POST here with no body.
  const result = await unsubscribeFromToken(token);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ success: true, email: result.email });
}
