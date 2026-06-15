import "server-only";

import { Resend } from "resend";

// ============================================================
// Transactional email for the Radar setup pipeline.
//
// Uses a platform-owned Resend key (PLATFORM_RESEND_API_KEY) — NOT
// the per-customer BYO connections in lib/hyperlocal/email/. Those
// are for customer-sent emails; these are AiM-sent notifications.
//
// Two messages:
//   - admin     → tells ops a new setup request landed and is
//                 waiting in the admin queue
//   - customer  → tells the customer their Radar dashboard is live
// ============================================================

const FROM_EMAIL =
  process.env.PLATFORM_RESEND_FROM ?? "AiM Radar <radar@aimarketingacademy.com>";
const ADMIN_EMAIL =
  process.env.RADAR_ADMIN_EMAIL ?? "derek@jasonpantana.com";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://apps.aimarketingacademy.com";

let cachedClient: Resend | null = null;

function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const key = process.env.PLATFORM_RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "PLATFORM_RESEND_API_KEY not configured. Set it in .env.local to enable Radar setup emails.",
    );
  }
  cachedClient = new Resend(key);
  return cachedClient;
}

export async function sendAdminNewRequestEmail(args: {
  requestId: string;
  hostname: string;
  requesterEmail: string | null;
  requesterName: string | null;
}): Promise<void> {
  const url = `${APP_URL}/admin/radar-requests`;
  const subject = `New Radar setup request: ${args.hostname}`;
  const requesterDisplay = args.requesterName ?? "(no name)";
  const requesterEmail = args.requesterEmail
    ? `&lt;${escapeHtml(args.requesterEmail)}&gt;`
    : "";

  const body = `
    <p style="margin:0 0 20px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.65;color:#3D4E5C;">
      A new Radar setup request just landed in the admin queue.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border-collapse:separate;border-spacing:0;border:1px solid #E5EBEC;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background:#F5F9F9;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0F7A6F;width:130px;border-bottom:1px solid #E5EBEC;">Hostname</td>
        <td style="padding:12px 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#1A2A3A;border-bottom:1px solid #E5EBEC;"><strong>${escapeHtml(args.hostname)}</strong></td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#F5F9F9;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0F7A6F;border-bottom:1px solid #E5EBEC;">Requester</td>
        <td style="padding:12px 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#1A2A3A;border-bottom:1px solid #E5EBEC;">${escapeHtml(requesterDisplay)} ${requesterEmail}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#F5F9F9;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0F7A6F;">Request ID</td>
        <td style="padding:12px 16px;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:12px;color:#3D4E5C;">${escapeHtml(args.requestId)}</td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">
      <tr>
        <td style="padding:14px 16px;background:#FFF8E6;border-left:3px solid #F0B429;border-radius:4px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.6;color:#3D4E5C;">
          <strong style="color:#8B6914;">Auto-research running.</strong>
          Suggested competitors will be visible in the admin queue within ~30 seconds.
        </td>
      </tr>
    </table>
  `;

  const html = renderBrandedEmail({
    preheader: `${args.hostname} is waiting in the Radar admin queue.`,
    eyebrow: "Admin · Radar",
    title: "New Radar setup request",
    body,
    ctaLabel: "Open admin queue",
    ctaUrl: url,
  });

  await getClient().emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject,
    html,
  });
}

export async function sendCustomerRadarReadyEmail(args: {
  toEmail: string;
  toName: string | null;
  hostname: string;
}): Promise<void> {
  const url = `${APP_URL}/apps/radar`;
  const firstName = args.toName ? args.toName.split(" ")[0] : null;
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
  const subject = `Your Radar dashboard is live`;
  const preheader = `AI visibility tracking for ${args.hostname} is up and running.`;
  const html = renderBrandedEmail({
    preheader,
    title: "Your Radar dashboard is live",
    eyebrow: "AiM Radar",
    body: `
      <p style="margin:0 0 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.65;color:#1A2A3A;">${greeting}</p>
      <p style="margin:0 0 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.65;color:#3D4E5C;">
        We've finished setting up AI visibility tracking for
        <strong style="color:#1A2A3A;">${escapeHtml(args.hostname)}</strong>.
        Your dashboard now shows how ChatGPT, Perplexity, Gemini, and other
        AI search engines talk about your brand.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0 8px;">
        <tr>
          <td style="padding:14px 16px;background:#F5F9F9;border-left:3px solid #17A697;border-radius:4px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.6;color:#3D4E5C;">
            <strong style="color:#0F7A6F;">What you'll see:</strong><br />
            • Share of voice against your competitors<br />
            • Average rank across tracked prompts<br />
            • Which AI sources are citing you
          </td>
        </tr>
      </table>
      <p style="margin:24px 0 12px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.6;color:#999;">
        First few hours of data are sparse while the engines warm up — by
        tomorrow you'll have a full picture. Questions? Just reply to this email.
      </p>
    `,
    ctaLabel: "Open your Radar dashboard",
    ctaUrl: url,
  });

  await getClient().emails.send({
    from: FROM_EMAIL,
    to: args.toEmail,
    subject,
    html,
  });
}

// ---------------------------------------------------------------------------
// Rank-drop / competitor-pass alert email
// ---------------------------------------------------------------------------

export interface RadarAlertReason {
  type: "rank_drop" | "competitor_pass";
  /** Prior rank, current rank — for rank_drop. Both ints. */
  fromRank?: number;
  toRank?: number;
  /** Competitor brand that passed you — for competitor_pass. */
  competitorBrand?: string;
}

export async function sendRadarAlertEmail(args: {
  toEmail: string;
  toName: string | null;
  hostname: string;
  reason: RadarAlertReason;
}): Promise<void> {
  const url = `${APP_URL}/apps/radar/dashboard`;
  const settingsUrl = `${APP_URL}/apps/radar/settings?tab=notifications`;
  const firstName = args.toName ? args.toName.split(" ")[0] : null;
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";

  let headline: string;
  let preheader: string;
  let calloutHtml: string;
  let copy: string;

  if (args.reason.type === "rank_drop") {
    headline = "Your AI rank just dropped";
    preheader = `${args.hostname} fell from #${args.reason.fromRank} to #${args.reason.toRank} across tracked prompts.`;
    calloutHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
        <tr>
          <td style="padding:20px 24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;text-align:center;">
            <p style="margin:0 0 8px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#991B1B;">Rank change</p>
            <p style="margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:28px;font-weight:700;color:#1A2A3A;">
              <span style="color:#3D4E5C;">#${args.reason.fromRank}</span>
              <span style="display:inline-block;margin:0 12px;color:#DC2626;font-size:22px;">→</span>
              <span style="color:#DC2626;">#${args.reason.toRank}</span>
            </p>
          </td>
        </tr>
      </table>`;
    copy = `<strong style="color:#1A2A3A;">${escapeHtml(args.hostname)}</strong> fell across the prompts we track. Worth a look — could be a one-time fluctuation, or a competitor pushing harder.`;
  } else {
    const competitor = args.reason.competitorBrand ?? "A competitor";
    headline = `${competitor} just passed you`;
    preheader = `${competitor} is now ranking ahead of ${args.hostname} in AI engine responses.`;
    calloutHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
        <tr>
          <td style="padding:20px 24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;text-align:center;">
            <p style="margin:0 0 8px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#991B1B;">Competitor pass</p>
            <p style="margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:22px;font-weight:700;color:#DC2626;">${escapeHtml(competitor)}</p>
            <p style="margin:6px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#3D4E5C;">now ahead of ${escapeHtml(args.hostname)}</p>
          </td>
        </tr>
      </table>`;
    copy = `<strong style="color:#1A2A3A;">${escapeHtml(competitor)}</strong> is now ranking ahead of ${escapeHtml(args.hostname)} in AI engine responses. Check the dashboard to see what they're doing differently.`;
  }

  const body = `
    <p style="margin:0 0 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.65;color:#1A2A3A;">${greeting}</p>
    ${calloutHtml}
    <p style="margin:0 0 20px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.65;color:#3D4E5C;">${copy}</p>
    <p style="margin:24px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:#999;">
      You're getting this because rank-drop alerts are on for your AiM Radar.
      <a href="${settingsUrl}" style="color:#17A697;text-decoration:underline;">Manage in Settings</a>.
    </p>
  `;

  const html = renderBrandedEmail({
    preheader,
    eyebrow: "AiM Radar · Alert",
    title: headline,
    body,
    ctaLabel: "Open Radar",
    ctaUrl: url,
  });

  await getClient().emails.send({
    from: FROM_EMAIL,
    to: args.toEmail,
    subject: headline,
    html,
  });
}

// ---------------------------------------------------------------------------
// Weekly digest email
// ---------------------------------------------------------------------------

export interface RadarDigestStats {
  brandRank: number | null;
  mentionRate: number; // 0-100
  totalMentions: number;
  citationRate: number; // 0-100
  topWin: string | null; // prompt text where they ranked best
  topGap: string | null; // prompt text where competitor wins
  topCompetitor: string | null; // who's winning the gap
}

export async function sendRadarDigestEmail(args: {
  toEmail: string;
  toName: string | null;
  hostname: string;
  stats: RadarDigestStats;
}): Promise<void> {
  const url = `${APP_URL}/apps/radar/dashboard`;
  const settingsUrl = `${APP_URL}/apps/radar/settings?tab=notifications`;
  const firstName = args.toName ? args.toName.split(" ")[0] : null;
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
  const subject = `Your weekly Radar digest`;
  const s = args.stats;

  const statCell = (label: string, value: string) => `
    <td width="50%" style="padding:18px 16px;background:#F5F9F9;border:1px solid #E5EBEC;text-align:center;">
      <p style="margin:0 0 6px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0F7A6F;">${escapeHtml(label)}</p>
      <p style="margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:24px;font-weight:700;color:#1A2A3A;">${value}</p>
    </td>`;

  const winBlock = s.topWin
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 16px;">
      <tr>
        <td style="padding:16px 20px;background:#F0FDF9;border-left:4px solid #17A697;border-radius:4px;">
          <p style="margin:0 0 6px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0F7A6F;">Your top win</p>
          <p style="margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.55;color:#1A2A3A;">${escapeHtml(s.topWin)}</p>
        </td>
      </tr>
    </table>`
    : "";

  const gapBlock =
    s.topGap && s.topCompetitor
      ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">
      <tr>
        <td style="padding:16px 20px;background:#FEF2F2;border-left:4px solid #DC2626;border-radius:4px;">
          <p style="margin:0 0 6px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#991B1B;">Where ${escapeHtml(s.topCompetitor)} beat you</p>
          <p style="margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.55;color:#1A2A3A;">${escapeHtml(s.topGap)}</p>
        </td>
      </tr>
    </table>`
      : "";

  const body = `
    <p style="margin:0 0 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.65;color:#1A2A3A;">${greeting}</p>
    <p style="margin:0 0 20px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.65;color:#3D4E5C;">
      Here's how <strong style="color:#1A2A3A;">${escapeHtml(args.hostname)}</strong> performed across AI search engines this week.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;margin:0 0 20px;">
      <tr>
        ${statCell("Average rank", s.brandRank != null ? `#${s.brandRank}` : "—")}
        ${statCell("Mention rate", `${Math.round(s.mentionRate)}%`)}
      </tr>
      <tr>
        ${statCell("Total mentions", s.totalMentions.toLocaleString())}
        ${statCell("Citation rate", `${Math.round(s.citationRate)}%`)}
      </tr>
    </table>

    ${winBlock}
    ${gapBlock}

    <p style="margin:24px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:#999;">
      Weekly digest is on for your AiM Radar.
      <a href="${settingsUrl}" style="color:#17A697;text-decoration:underline;">Manage in Settings</a>.
    </p>
  `;

  const preheaderParts = [
    s.brandRank != null ? `Avg rank #${s.brandRank}` : null,
    `${Math.round(s.mentionRate)}% mention rate`,
    `${s.totalMentions.toLocaleString()} mentions`,
  ].filter(Boolean);

  const html = renderBrandedEmail({
    preheader: `This week: ${preheaderParts.join(" · ")}.`,
    eyebrow: "AiM Radar · Weekly",
    title: "Your Radar week in review",
    body,
    ctaLabel: "See the full dashboard",
    ctaUrl: url,
  });

  await getClient().emails.send({
    from: FROM_EMAIL,
    to: args.toEmail,
    subject,
    html,
  });
}

// ---------------------------------------------------------------------------
// Change-request admin notification
// ---------------------------------------------------------------------------

export async function sendAdminChangeRequestEmail(args: {
  requestId: string;
  type: "add_prompt" | "add_competitor";
  hostname: string;
  payload: Record<string, unknown>;
  requesterEmail: string | null;
  requesterName: string | null;
}): Promise<void> {
  const url = `${APP_URL}/admin/radar-requests`;
  const summary =
    args.type === "add_prompt"
      ? `Prompt: "${String(args.payload.prompt ?? "")}"`
      : `Competitor: ${String(args.payload.brand ?? "")}${args.payload.domain ? ` (${String(args.payload.domain)})` : ""}`;
  const subject = `Radar change request: ${args.type.replace("_", " ")} — ${args.hostname}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px 0; font-size: 18px;">Radar change request</h2>
      <table style="border-collapse: collapse; font-size: 14px; line-height: 1.5;">
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Type</td><td>${escapeHtml(args.type)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Hostname</td><td>${escapeHtml(args.hostname)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Detail</td><td>${escapeHtml(summary)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Requester</td><td>${escapeHtml(args.requesterName ?? "(no name)")} ${args.requesterEmail ? `&lt;${escapeHtml(args.requesterEmail)}&gt;` : ""}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Request ID</td><td><code>${escapeHtml(args.requestId)}</code></td></tr>
      </table>
      <p style="margin-top: 20px;">
        <a href="${url}" style="display: inline-block; padding: 10px 16px; background: #0f172a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">Open admin queue</a>
      </p>
    </div>
  `.trim();

  await getClient().emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Branded email shell (AiM Automations palette: teal #17A697 → blue #1B7FB5)
// Table-based for client compat (Outlook desktop ignores flex/grid).
// ---------------------------------------------------------------------------

interface BrandedEmailOpts {
  /** Inbox preview text — hidden in body but read by Gmail/Apple Mail. */
  preheader: string;
  /** Small label above the headline (e.g. "AiM Radar"). */
  eyebrow: string;
  /** Main H1 in the white card. */
  title: string;
  /** Pre-rendered HTML body — caller supplies escaped content. */
  body: string;
  /** CTA pill button label + href. Omit ctaUrl to skip the button. */
  ctaLabel?: string;
  ctaUrl?: string;
}

function renderBrandedEmail(opts: BrandedEmailOpts): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
          <tr>
            <td style="border-radius:8px;background:#17A697;">
              <a href="${opts.ctaUrl}" style="display:inline-block;padding:14px 24px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(opts.ctaLabel)}</a>
            </td>
          </tr>
        </table>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(opts.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#1A2A3A;">
  <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;mso-hide:all;">${escapeHtml(opts.preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F5F5F5;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(26,42,58,0.08);">
          <!-- Header: teal → blue gradient -->
          <tr>
            <td style="background:linear-gradient(135deg,#17A697 0%,#1B7FB5 100%);background-color:#17A697;padding:32px 32px 28px;text-align:left;">
              <img src="${APP_URL}/logo-white.svg" alt="AiM Automations" height="28" style="display:block;height:28px;margin:0 0 18px;border:0;outline:none;text-decoration:none;" />
              <p style="margin:0 0 6px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">${escapeHtml(opts.eyebrow)}</p>
              <h1 style="margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:24px;font-weight:700;line-height:1.3;color:#ffffff;">${escapeHtml(opts.title)}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${opts.body}
              ${cta}
            </td>
          </tr>
          <!-- Footer: deep navy -->
          <tr>
            <td style="background:#1A2A3A;padding:24px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#4ECDC1;">AiM Automations</p>
              <p style="margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.6);">
                AI-powered marketing tools for real estate professionals.<br />
                <a href="${APP_URL}/apps" style="color:#4ECDC1;text-decoration:none;">apps.aimarketingacademy.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
