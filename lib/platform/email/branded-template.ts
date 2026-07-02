export const DEFAULT_PLATFORM_APP_URL = "https://apps.aimarketingacademy.com";

export function getPlatformAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_PLATFORM_APP_URL;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeHtmlAttribute(s: string): string {
  return escapeHtml(s).replace(/`/g, "&#96;");
}

// ---------------------------------------------------------------------------
// Branded email shell (AiM Automations palette: teal #17A697 -> blue #1B7FB5)
// Table-based for client compat (Outlook desktop ignores flex/grid).
// ---------------------------------------------------------------------------

export interface BrandedEmailOpts {
  /** Inbox preview text, hidden in body but read by Gmail/Apple Mail. */
  preheader: string;
  /** Small label above the headline, e.g. "AiM Radar". */
  eyebrow: string;
  /** Main H1 in the white card. */
  title: string;
  /** Pre-rendered HTML body. Caller supplies escaped content. */
  body: string;
  /** CTA pill button label and href. Omit ctaUrl to skip the button. */
  ctaLabel?: string;
  ctaUrl?: string;
  /** App origin for logo/footer links. Defaults to NEXT_PUBLIC_APP_URL. */
  appUrl?: string;
}

export function renderBrandedEmail(opts: BrandedEmailOpts): string {
  const appUrl = opts.appUrl ?? getPlatformAppUrl();
  const escapedAppUrl = escapeHtmlAttribute(appUrl);
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
          <tr>
            <td style="border-radius:8px;background:#17A697;">
              <a href="${escapeHtmlAttribute(opts.ctaUrl)}" style="display:inline-block;padding:14px 24px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(opts.ctaLabel)}</a>
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
          <!-- Header: teal -> blue gradient -->
          <tr>
            <td style="background:linear-gradient(135deg,#17A697 0%,#1B7FB5 100%);background-color:#17A697;padding:32px 32px 28px;text-align:left;">
              <div style="margin:0 0 18px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.01em;color:#ffffff;">AiM</div>
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
                <a href="${escapedAppUrl}/apps" style="color:#4ECDC1;text-decoration:none;">apps.aimarketingacademy.com</a>
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
