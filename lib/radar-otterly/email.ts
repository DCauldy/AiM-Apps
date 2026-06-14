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
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px 0; font-size: 18px;">New Radar setup request</h2>
      <table style="border-collapse: collapse; font-size: 14px; line-height: 1.5;">
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Hostname</td><td>${escapeHtml(args.hostname)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Requester</td><td>${escapeHtml(args.requesterName ?? "(no name)")} ${args.requesterEmail ? `&lt;${escapeHtml(args.requesterEmail)}&gt;` : ""}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Request ID</td><td><code>${escapeHtml(args.requestId)}</code></td></tr>
      </table>
      <p style="margin-top: 20px; font-size: 14px; color: #444;">
        Auto-research has kicked off in the background. Suggested
        competitors will be visible in the admin queue within ~30 seconds.
      </p>
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

export async function sendCustomerRadarReadyEmail(args: {
  toEmail: string;
  toName: string | null;
  hostname: string;
}): Promise<void> {
  const url = `${APP_URL}/apps/radar`;
  const greeting = args.toName ? `Hi ${escapeHtml(args.toName.split(" ")[0])},` : "Hi,";
  const subject = `Your Radar dashboard is live`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px 0; font-size: 20px;">Your Radar dashboard is live</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #333;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.6; color: #333;">
        We've finished setting up AI visibility tracking for
        <strong>${escapeHtml(args.hostname)}</strong>. Your dashboard now
        shows how ChatGPT, Perplexity, Gemini, and other AI search engines
        talk about your brand — including share of voice against your
        competitors, average rank, and what AI sources are citing.
      </p>
      <p style="margin-top: 24px;">
        <a href="${url}" style="display: inline-block; padding: 12px 20px; background: #0f172a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 500;">Open your Radar dashboard</a>
      </p>
      <p style="margin-top: 24px; font-size: 13px; color: #777; line-height: 1.6;">
        First few hours of data are sparse while the engines warm up — by
        tomorrow you'll have a full picture. Questions? Reply to this email.
      </p>
      <p style="margin-top: 24px; font-size: 12px; color: #999;">— The AiM team</p>
    </div>
  `.trim();

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
  const greeting = args.toName
    ? `Hi ${escapeHtml(args.toName.split(" ")[0])},`
    : "Hi,";

  let headline: string;
  let body: string;
  if (args.reason.type === "rank_drop") {
    headline = `Your AI rank just dropped`;
    body = `${escapeHtml(args.hostname)} fell from <strong>#${args.reason.fromRank}</strong> to <strong>#${args.reason.toRank}</strong> across the prompts we track. Worth a look — could be a one-time fluctuation, or a competitor pushing harder.`;
  } else {
    headline = `${escapeHtml(args.reason.competitorBrand ?? "A competitor")} just passed you`;
    body = `<strong>${escapeHtml(args.reason.competitorBrand ?? "A competitor")}</strong> is now ranking ahead of ${escapeHtml(args.hostname)} in AI engine responses. Check the dashboard to see what they're doing differently.`;
  }

  const subject = headline;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px 0; font-size: 20px;">${headline}</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #333;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.6; color: #333;">${body}</p>
      <p style="margin-top: 24px;">
        <a href="${url}" style="display: inline-block; padding: 12px 20px; background: #0f172a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 500;">Open Radar</a>
      </p>
      <p style="margin-top: 24px; font-size: 12px; color: #999;">
        You're getting this because rank-drop alerts are on for your AiM Radar.
        <a href="${APP_URL}/apps/radar/settings?tab=notifications" style="color: #999;">Manage in Settings</a>.
      </p>
    </div>
  `.trim();

  await getClient().emails.send({
    from: FROM_EMAIL,
    to: args.toEmail,
    subject,
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
  const greeting = args.toName
    ? `Hi ${escapeHtml(args.toName.split(" ")[0])},`
    : "Hi,";
  const subject = `Your weekly Radar digest`;
  const s = args.stats;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px 0; font-size: 20px;">Your Radar week in review</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #333;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.6; color: #333;">
        Here's how <strong>${escapeHtml(args.hostname)}</strong> performed across
        AI search engines this week.
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <tr>
          <td style="padding: 10px 12px; border: 1px solid #eee; background: #fafafa; width: 50%;">
            <div style="font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.05em;">Average rank</div>
            <div style="font-size: 22px; font-weight: 600; color: #0f172a;">${s.brandRank != null ? `#${s.brandRank}` : "—"}</div>
          </td>
          <td style="padding: 10px 12px; border: 1px solid #eee; background: #fafafa; width: 50%;">
            <div style="font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.05em;">Mention rate</div>
            <div style="font-size: 22px; font-weight: 600; color: #0f172a;">${Math.round(s.mentionRate)}%</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; border: 1px solid #eee; background: #fafafa;">
            <div style="font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.05em;">Total mentions</div>
            <div style="font-size: 22px; font-weight: 600; color: #0f172a;">${s.totalMentions.toLocaleString()}</div>
          </td>
          <td style="padding: 10px 12px; border: 1px solid #eee; background: #fafafa;">
            <div style="font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.05em;">Citation rate</div>
            <div style="font-size: 22px; font-weight: 600; color: #0f172a;">${Math.round(s.citationRate)}%</div>
          </td>
        </tr>
      </table>

      ${
        s.topWin
          ? `<p style="font-size: 14px; line-height: 1.6; color: #333; margin: 16px 0 4px 0;">
        🏆 <strong>Your top win:</strong>
      </p>
      <p style="font-size: 14px; line-height: 1.5; color: #555; margin: 0 0 16px 0; padding-left: 16px; border-left: 3px solid #10b981;">
        ${escapeHtml(s.topWin)}
      </p>`
          : ""
      }

      ${
        s.topGap && s.topCompetitor
          ? `<p style="font-size: 14px; line-height: 1.6; color: #333; margin: 16px 0 4px 0;">
        📉 <strong>Where ${escapeHtml(s.topCompetitor)} beat you:</strong>
      </p>
      <p style="font-size: 14px; line-height: 1.5; color: #555; margin: 0 0 16px 0; padding-left: 16px; border-left: 3px solid #ef4444;">
        ${escapeHtml(s.topGap)}
      </p>`
          : ""
      }

      <p style="margin-top: 24px;">
        <a href="${url}" style="display: inline-block; padding: 12px 20px; background: #0f172a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 500;">See the full dashboard</a>
      </p>

      <p style="margin-top: 24px; font-size: 12px; color: #999;">
        Weekly digest is on for your AiM Radar.
        <a href="${APP_URL}/apps/radar/settings?tab=notifications" style="color: #999;">Manage in Settings</a>.
      </p>
    </div>
  `.trim();

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
