import "server-only";

import type { PlatformProfile } from "@/types/platform-profile";

// ============================================================
// CMA email render — inline summary HTML + plain-text fallback.
//
// The email is the entry point; the full report lives on the
// landing page. Body sells the click, not the report itself —
// one strong headline, three big stats, the "open report" CTA,
// agent signature, compliance footer.
//
// Wave 4 ships plain HTML strings — no React Email — because the
// surface area is small (~120 lines) and the cadence pipeline runs
// in an Inngest step where a string template avoids the
// renderToStaticMarkup overhead. We can swap to React Email later
// when the count of email types grows.
// ============================================================

export interface CmaEmailRenderInput {
  client: {
    first_name: string | null;
    last_name: string | null;
    address: string;
    /** Optional, only present when there's prior delivery for vs-last. */
    last_delivered_at?: string | null;
  };
  cma: {
    recommended_price_cents: number;
    estimated_value_cents: number;
    /** Set when a prior delivery exists. Cents change since last CMA. */
    delta_since_last_cents?: number | null;
    delta_since_last_pct?: number | null;
  };
  /** Public landing-page URL. */
  landing_url: string;
  /** Public 1-click unsubscribe URL (CAN-SPAM). */
  unsubscribe_url: string;
  agent: Pick<
    PlatformProfile,
    | "full_name"
    | "display_name"
    | "title"
    | "brokerage"
    | "phone"
    | "reply_to_email"
    | "physical_address"
    | "sign_off"
    | "license_number"
    | "license_info"
    | "legal_disclaimer"
    | "primary_color"
    | "accent_color"
    | "logo_url"
    | "headshot_url"
  >;
  /** Hero image — RapidAPI photo or Mapbox static URL. */
  hero_image_url: string | null;
}

export interface CmaEmailRendered {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

const SAFE_PRIMARY = "#1E293B";
const SAFE_ACCENT = "#D4A35C";

export function renderCmaEmail(input: CmaEmailRenderInput): CmaEmailRendered {
  const firstName = input.client.first_name?.trim() || "there";
  const fullAgentName =
    input.agent.full_name?.trim() ||
    input.agent.display_name?.trim() ||
    "your agent";
  const primary = sanitizeHex(input.agent.primary_color) ?? SAFE_PRIMARY;
  const accent = sanitizeHex(input.agent.accent_color) ?? SAFE_ACCENT;

  const valueFormatted = formatDollars(input.cma.recommended_price_cents);
  const estFormatted = formatDollars(input.cma.estimated_value_cents);

  const subject = `${input.client.address} — fresh CMA from ${fullAgentName}`;
  const preheader = `Your home is now valued around ${valueFormatted}. See the full report.`;

  // Three big stats — recommended price, estimated value, delta-vs-last
  // when prior CMA exists; otherwise the third tile lists the property
  // address so the email feels grounded.
  const deltaTile = renderDeltaTile(input.cma, accent);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subject)}</title>
<style>
  @media (max-width: 480px) {
    .stats { display: block !important; }
    .stat-cell { display: block !important; width: 100% !important; padding: 14px 16px !important; }
    .hero-img { height: 180px !important; }
    .cta-btn { display: block !important; text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
<!-- preheader: hidden but pulled into inbox preview -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0f172a;opacity:0;">${escapeHtml(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.25);">

      <!-- Hero -->
      ${
        input.hero_image_url
          ? `<tr><td>
        <img class="hero-img" src="${escapeAttr(input.hero_image_url)}" alt="${escapeAttr(input.client.address)}" width="600" style="display:block;width:100%;height:240px;object-fit:cover;border:0;">
      </td></tr>`
          : `<tr><td style="background:linear-gradient(135deg,${primary} 0%,${accent} 100%);height:80px;"></td></tr>`
      }

      <!-- Headline -->
      <tr><td style="padding:28px 28px 8px 28px;">
        <div style="font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:1.4px;font-weight:600;">Quarterly CMA</div>
        <h1 style="margin:8px 0 0 0;font-size:24px;line-height:1.25;color:#0f172a;">
          Hi ${escapeHtml(firstName)} — your home at <span style="color:${accent};">${escapeHtml(input.client.address)}</span> is now valued around ${escapeHtml(valueFormatted)}.
        </h1>
      </td></tr>

      <!-- Three big stats -->
      <tr><td style="padding:20px 28px 6px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stats" style="border-collapse:separate;border-spacing:8px 0;">
          <tr>
            <td class="stat-cell" width="33%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;vertical-align:top;">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;">Recommended list</div>
              <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:4px;">${escapeHtml(valueFormatted)}</div>
            </td>
            <td class="stat-cell" width="33%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;vertical-align:top;">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;">Estimated value</div>
              <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:4px;">${escapeHtml(estFormatted)}</div>
            </td>
            <td class="stat-cell" width="33%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;vertical-align:top;">
              ${deltaTile}
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="padding:24px 28px 8px 28px;text-align:center;">
        <a class="cta-btn" href="${escapeAttr(input.landing_url)}" style="display:inline-block;background:linear-gradient(135deg,${primary} 0%,${accent} 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;">
          See your full report →
        </a>
      </td></tr>

      <!-- Body copy -->
      <tr><td style="padding:14px 28px 24px 28px;font-size:14px;line-height:1.55;color:#334155;">
        <p style="margin:0 0 12px 0;">
          This is your quarterly check-in on your home's value. The report inside walks through
          how we got to this number — the recent neighborhood sales we compared it to, the
          adjustments we made, and where prices are heading.
        </p>
        <p style="margin:0;">
          Questions, or thinking about your next move? Hit reply or call me directly.
        </p>
      </td></tr>

      <!-- Agent signature -->
      <tr><td style="padding:0 28px 24px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            ${
              input.agent.headshot_url
                ? `<td valign="top" style="padding-right:14px;">
              <img src="${escapeAttr(input.agent.headshot_url)}" width="56" height="56" alt="" style="display:block;border-radius:50%;border:0;width:56px;height:56px;object-fit:cover;">
            </td>`
                : ""
            }
            <td valign="top">
              <div style="font-size:15px;font-weight:600;color:#0f172a;">${escapeHtml(fullAgentName)}</div>
              ${
                input.agent.title
                  ? `<div style="font-size:13px;color:#64748b;">${escapeHtml(input.agent.title)}</div>`
                  : ""
              }
              ${
                input.agent.brokerage
                  ? `<div style="font-size:13px;color:#64748b;">${escapeHtml(input.agent.brokerage)}</div>`
                  : ""
              }
              <div style="font-size:13px;color:#64748b;margin-top:4px;">
                ${
                  input.agent.phone
                    ? `<a href="tel:${escapeAttr(input.agent.phone)}" style="color:${accent};text-decoration:none;">${escapeHtml(input.agent.phone)}</a>`
                    : ""
                }
                ${
                  input.agent.phone && input.agent.reply_to_email ? " · " : ""
                }
                ${
                  input.agent.reply_to_email
                    ? `<a href="mailto:${escapeAttr(input.agent.reply_to_email)}" style="color:${accent};text-decoration:none;">${escapeHtml(input.agent.reply_to_email)}</a>`
                    : ""
                }
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>

    <!-- Compliance footer -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin-top:16px;">
      <tr><td style="padding:8px 24px;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;">
        ${
          input.agent.license_info ||
          (input.agent.license_number
            ? `Licensed real estate professional ${escapeHtml(input.agent.license_number)}`
            : "")
        }
        ${
          input.agent.legal_disclaimer
            ? `<div style="margin-top:6px;">${escapeHtml(input.agent.legal_disclaimer)}</div>`
            : ""
        }
        ${
          input.agent.physical_address
            ? `<div style="margin-top:6px;">${escapeHtml(input.agent.physical_address)}</div>`
            : ""
        }
        <div style="margin-top:8px;">
          You're receiving this because ${escapeHtml(fullAgentName)} helped you with a real estate transaction. ·
          <a href="${escapeAttr(input.unsubscribe_url)}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
        </div>
        <div style="margin-top:6px;color:#64748b;">Equal Housing Opportunity</div>
      </td></tr>
    </table>

  </td></tr>
</table>
</body>
</html>`;

  const text = renderText(input, fullAgentName, valueFormatted, estFormatted);

  return { subject, preheader, html, text };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDeltaTile(
  cma: CmaEmailRenderInput["cma"],
  accent: string,
): string {
  if (cma.delta_since_last_cents == null || cma.delta_since_last_pct == null) {
    // No prior delivery → tile is a placeholder. Keep it neutral so the
    // first send doesn't look broken.
    return `
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;">First CMA</div>
      <div style="font-size:22px;font-weight:700;color:${accent};margin-top:4px;">Baseline</div>
    `;
  }
  const positive = cma.delta_since_last_cents >= 0;
  const arrow = positive ? "▲" : "▼";
  const color = positive ? "#059669" : "#dc2626";
  const sign = positive ? "+" : "";
  return `
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;">Vs last CMA</div>
    <div style="font-size:22px;font-weight:700;color:${color};margin-top:4px;">
      ${arrow} ${sign}${cma.delta_since_last_pct.toFixed(1)}%
    </div>
    <div style="font-size:11px;color:#64748b;margin-top:2px;">${sign}${formatDollars(cma.delta_since_last_cents)}</div>
  `;
}

function renderText(
  input: CmaEmailRenderInput,
  fullAgentName: string,
  valueFormatted: string,
  estFormatted: string,
): string {
  const firstName = input.client.first_name?.trim() || "there";
  const lines = [
    `Hi ${firstName},`,
    "",
    `Your home at ${input.client.address} is now valued around ${valueFormatted}.`,
    "",
    `Recommended list:  ${valueFormatted}`,
    `Estimated value:   ${estFormatted}`,
  ];
  if (input.cma.delta_since_last_pct != null) {
    const sign = (input.cma.delta_since_last_cents ?? 0) >= 0 ? "+" : "";
    lines.push(
      `Vs last CMA:       ${sign}${input.cma.delta_since_last_pct.toFixed(1)}% (${sign}${formatDollars(input.cma.delta_since_last_cents ?? 0)})`,
    );
  } else {
    lines.push(`Vs last CMA:       baseline (first send)`);
  }
  lines.push(
    "",
    `Read the full report (comp set, adjustments, market trend):`,
    input.landing_url,
    "",
    `Questions, or thinking about your next move? Hit reply or give me a call.`,
    "",
    `— ${fullAgentName}`,
  );
  if (input.agent.phone || input.agent.reply_to_email) {
    lines.push(
      [input.agent.phone, input.agent.reply_to_email]
        .filter(Boolean)
        .join(" · "),
    );
  }
  lines.push(
    "",
    "—",
    `You're receiving this because ${fullAgentName} helped you with a real estate transaction.`,
    `Unsubscribe: ${input.unsubscribe_url}`,
    `Equal Housing Opportunity`,
  );
  return lines.join("\n");
}

function formatDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function sanitizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) return v;
  return null;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function escapeAttr(s: string): string {
  // Same as HTML escape but the function name documents intent at the
  // call site. URL-bearing attributes get the same treatment as text
  // since we never trust string interpolation into attributes.
  return escapeHtml(s);
}
