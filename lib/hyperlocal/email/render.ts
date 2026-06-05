import type {
  HlSegment,
  MlsMetrics,
  PlatformBrandingProfile,
  PlatformSenderProfile,
} from "@/types/hyperlocal";

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

  const metricsBlock = renderMetricsTable(opts.metrics, b.accent_color);

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

  const footerAddress = `
    <p style="margin:0;color:#666;font-size:11px;line-height:1.5;white-space:pre-line;">${escapeHtml(opts.sender.physical_address)}</p>
  `;

  const disclaimer = b.legal_disclaimer
    ? `<p style="margin:12px 0 0;color:#888;font-size:11px;font-style:italic;">${escapeHtml(b.legal_disclaimer)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(heading)}</title>
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
              ${footerAddress}
              ${disclaimer}
              <p style="margin:12px 0 0;color:#888;font-size:11px;">
                <a href="${opts.unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a> from these market updates.
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
  accentColor: string
): string {
  if (!metrics || Object.keys(metrics).length === 0) return "";

  const cells: { label: string; value: string }[] = [];
  if (metrics.median_sale_price)
    cells.push({
      label: "Median Sale",
      value: "$" + Math.round(metrics.median_sale_price).toLocaleString(),
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
      </td>`
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr>${cellHtml}</tr>
    </table>
  `;
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
