import type {
  HlSegment,
  MlsMetrics,
  PlatformBrandingProfile,
  PlatformSenderProfile,
} from "@/types/hyperlocal";
import {
  FAIR_HOUSING_NOTICE,
  getStateRequirements,
} from "./state-requirements";
import { googleFontsLinkFor } from "@/lib/fonts/google-fonts";

interface RenderOpts {
  branding: PlatformBrandingProfile | null;
  sender: PlatformSenderProfile;
  segment: HlSegment;
  metrics: MlsMetrics | null;
  sellerHtml: string | null;
  buyerHtml: string | null;
  preheader: string;
  unsubscribeUrl: string;
  /** Mapbox Static Images URL — embedded as <img> between header + metrics. */
  staticMapUrl?: string | null;
  /** YoY / 3-year price-change deltas from hl_market_snapshots. When null we
   *  skip the trend chip entirely instead of showing "0%" or "—". */
  yoyPriceChangePct?: number | null;
  threeYearPriceChangePct?: number | null;
}

const DEFAULT_BRAND = {
  primary_color: "#1B7FB5",
  secondary_color: "#17A697",
  accent_color: "#31DBA5",
  heading_font: "Inter, sans-serif",
  body_font: "Inter, sans-serif",
  legal_disclaimer: null as string | null,
  header_treatment: "solid" as const,
  logo_url: null as string | null,
};

export function renderEmailHtml(opts: RenderOpts): string {
  const b = opts.branding ?? DEFAULT_BRAND;
  const heading = `${opts.segment.geo_label || opts.segment.geo_key} Market Snapshot`;

  const headerBg =
    b.header_treatment === "gradient"
      ? `linear-gradient(135deg, ${b.primary_color}, ${b.secondary_color})`
      : b.primary_color;

  const metricsBlock = renderMetricsTable(
    opts.metrics,
    b.accent_color,
    opts.yoyPriceChangePct ?? null,
    opts.threeYearPriceChangePct ?? null,
  );

  const sellerSection = opts.sellerHtml
    ? `<h2 style="font-family:${b.heading_font};color:${b.primary_color};font-size:18px;margin:32px 0 8px;">For Homeowners</h2>${opts.sellerHtml}`
    : "";

  const buyerSection = opts.buyerHtml
    ? `<h2 style="font-family:${b.heading_font};color:${b.primary_color};font-size:18px;margin:32px 0 8px;">For Buyers</h2>${opts.buyerHtml}`
    : "";

  const signOff = opts.sender.sign_off || "Talk soon,";
  const senderBlock = `
    <p style="margin:24px 0 4px;">${escapeHtml(signOff)}</p>
    <p style="margin:0;font-weight:600;">${escapeHtml(opts.sender.full_name)}</p>
    ${opts.sender.title ? `<p style="margin:0;color:#555;font-size:13px;">${escapeHtml(opts.sender.title)}</p>` : ""}
    ${opts.sender.brokerage ? `<p style="margin:0;color:#555;font-size:13px;">${escapeHtml(opts.sender.brokerage)}</p>` : ""}
    ${opts.sender.phone ? `<p style="margin:8px 0 0;font-size:13px;">📞 ${escapeHtml(opts.sender.phone)}</p>` : ""}
  `;

  // ---- State-aware compliance footer ----
  const reqs = getStateRequirements(opts.sender.state);

  const whyReceiving = `
    <p style="margin:0 0 8px;color:#888;font-size:11px;line-height:1.5;">
      You're receiving this hyperlocal market update because you're part of ${escapeHtml(opts.sender.full_name)}'s sphere${opts.sender.brokerage ? ` at ${escapeHtml(opts.sender.brokerage)}` : ""}.
    </p>
  `;

  const licenseLine = (() => {
    const parts: string[] = [];
    if (opts.sender.license_number) {
      parts.push(`License #${escapeHtml(opts.sender.license_number)}`);
    }
    if (opts.sender.regulatory_body) {
      parts.push(escapeHtml(opts.sender.regulatory_body));
    }
    if (opts.sender.brokerage) {
      parts.push(escapeHtml(opts.sender.brokerage));
    }
    return parts.length > 0
      ? `<p style="margin:0;color:#666;font-size:11px;line-height:1.5;">${parts.join(" · ")}</p>`
      : "";
  })();

  const supervisingBroker =
    reqs.requires_supervising_broker && opts.sender.license_info
      ? `<p style="margin:4px 0 0;color:#666;font-size:11px;line-height:1.5;">${escapeHtml(opts.sender.license_info)}</p>`
      : "";

  const footerAddress = `
    <p style="margin:8px 0 0;color:#666;font-size:11px;line-height:1.5;white-space:pre-line;">${escapeHtml(opts.sender.physical_address)}</p>
  `;

  const fairHousing = reqs.requires_fair_housing_notice
    ? `<p style="margin:8px 0 0;color:#888;font-size:11px;line-height:1.5;">⌂ ${escapeHtml(FAIR_HOUSING_NOTICE)}</p>`
    : "";

  // Profile disclaimer takes precedence; state default fills the gap so
  // there is always *something* in this slot when a state demands it.
  const disclaimerText =
    b.legal_disclaimer && b.legal_disclaimer.trim()
      ? b.legal_disclaimer
      : reqs.default_disclaimer;
  const disclaimer = disclaimerText
    ? `<p style="margin:8px 0 0;color:#888;font-size:11px;font-style:italic;line-height:1.5;">${escapeHtml(disclaimerText)}</p>`
    : "";

  // Load the agent's chosen Google Fonts so heading_font / body_font actually
  // render on supporting clients (Apple Mail, Gmail web, iOS Mail). Outlook
  // desktop ignores web fonts and falls back to the family fallback chain,
  // which is fine — sans-serif / serif renders cleanly.
  const fontsLink = googleFontsLinkFor(b.heading_font, b.body_font);
  const fontsHead = fontsLink
    ? `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="${fontsLink}" />`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(heading)}</title>
  ${fontsHead}
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:${b.body_font};color:#1a1a1a;">
  <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;mso-hide:all;">${escapeHtml(opts.preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background:${headerBg};padding:24px;color:#ffffff;">
              ${b.logo_url ? `<img src="${b.logo_url}" alt="Logo" style="max-height:36px;display:block;margin-bottom:12px;" />` : ""}
              <h1 style="margin:0;font-family:${b.heading_font};font-size:22px;font-weight:700;">${escapeHtml(heading)}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Hyperlocal market update from ${escapeHtml(opts.sender.full_name)}</p>
            </td>
          </tr>
          ${opts.staticMapUrl ? `
          <!-- Map -->
          <tr>
            <td style="padding:0;font-size:0;line-height:0;">
              <img src="${opts.staticMapUrl}" alt="Map of ${escapeHtml(opts.segment.geo_label || opts.segment.geo_key)}" width="600" style="display:block;width:100%;height:auto;max-width:600px;border:0;outline:none;" />
            </td>
          </tr>` : ""}
          <!-- Metrics -->
          <tr>
            <td style="padding:24px 24px 0;">
              ${metricsBlock}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:0 24px;font-size:15px;line-height:1.65;color:#1a1a1a;">
              ${sellerSection}
              ${buyerSection}
              ${senderBlock}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px;background:#fafafa;border-top:1px solid #eee;">
              ${whyReceiving}
              ${licenseLine}
              ${supervisingBroker}
              ${footerAddress}
              ${fairHousing}
              ${disclaimer}
              <p style="margin:12px 0 0;color:#888;font-size:11px;line-height:1.5;">
                <a href="${opts.unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a> from these hyperlocal market updates.
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

function renderMetricsTable(
  metrics: MlsMetrics | null,
  accentColor: string,
  yoyPct: number | null,
  threeYearPct: number | null,
): string {
  if (!metrics || Object.keys(metrics).length === 0) return "";

  const cells: { label: string; value: string; subline?: string }[] = [];
  if (metrics.median_sale_price)
    cells.push({
      label: "Median Sale",
      value: "$" + Math.round(metrics.median_sale_price).toLocaleString(),
      subline: formatTrendBadge(yoyPct, "YoY"),
    });
  if (metrics.median_days_on_market)
    cells.push({
      label: "Days on Market",
      value: String(Math.round(metrics.median_days_on_market)),
    });
  if (metrics.list_to_sale_ratio)
    cells.push({
      label: "List-to-Sale",
      value: metrics.list_to_sale_ratio.toFixed(1) + "%",
    });
  if (metrics.inventory_active)
    cells.push({
      label: "Active Listings",
      value: String(metrics.inventory_active),
    });

  if (cells.length === 0) return "";

  const cellHtml = cells
    .map(
      (c) => `
      <td style="padding:12px;text-align:center;border:1px solid #eee;background:#fff;">
        <p style="margin:0;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(c.label)}</p>
        <p style="margin:4px 0 0;color:${accentColor};font-size:18px;font-weight:700;">${escapeHtml(c.value)}</p>
        ${c.subline ? `<p style=\"margin:2px 0 0;font-size:10px;font-weight:600;\">${c.subline}</p>` : ""}
      </td>`
    )
    .join("");

  // 3-year context line sits below the table so the cells stay one-liner-clean.
  const threeYearLine =
    threeYearPct != null
      ? `<p style="margin:6px 0 0;color:#888;font-size:11px;text-align:center;">${formatThreeYearLine(threeYearPct)}</p>`
      : "";

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr>${cellHtml}</tr>
    </table>
    ${threeYearLine}
  `;
}

function formatTrendBadge(pct: number | null, period: string): string | undefined {
  if (pct == null || !Number.isFinite(pct)) return undefined;
  const positive = pct > 0;
  const negative = pct < 0;
  if (!positive && !negative) return undefined;
  const color = positive ? "#16A34A" : "#DC2626";
  const arrow = positive ? "▲" : "▼";
  const value = Math.abs(pct).toFixed(1);
  return `<span style="color:${color};">${arrow} ${value}% ${period}</span>`;
}

function formatThreeYearLine(pct: number): string {
  const positive = pct > 0;
  const verb = positive ? "up" : pct < 0 ? "down" : "flat";
  if (pct === 0) return "Median sale price flat over the last 3 years.";
  return `Median sale price ${verb} <strong>${Math.abs(pct).toFixed(1)}%</strong> over the last 3 years.`;
}

/**
 * Convert rendered HTML to a plain-text fallback (minimal — strips tags).
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(h1|h2|h3|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
