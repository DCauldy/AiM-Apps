import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { dispatchEmail } from "@/lib/hyperlocal/email/dispatch";
import { renderEmailHtml, htmlToPlainText } from "@/lib/hyperlocal/email/render";
import {
  generateUnsubscribeToken,
  buildUnsubscribeUrl,
} from "@/lib/hyperlocal/email/unsubscribe";
import { isSuppressed } from "@/lib/hyperlocal/email/suppressions";
import { getPreviewTemplate } from "@/lib/hyperlocal/email/preview-templates";
import { buildStaticMapUrl } from "@/lib/hyperlocal/map/static-map";
import { getAdapter, hasAdapter } from "@/lib/hyperlocal/email/providers/registry";
import { NextRequest } from "next/server";
import type {
  HlEmailConnection,
  PlatformBrandingProfile,
  PlatformSenderProfile,
} from "@/types/hyperlocal";

export const dynamic = "force-dynamic";

// ============================================================
// Synthetic market-report renderer for design iteration.
//
// Lets the agent eyeball their template + branding + compliance
// footer in their own inbox without standing up a full campaign
// (no Perplexity / GPT / image-gen costs, no MLS upload, no
// CRM contacts required). Sample scenarios live in
// preview-templates.ts so we can grow the catalog without
// touching this route.
// ============================================================

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/apps/hyperlocal/email-connections/:id/preview-send
 * Body: { to_email?, template? } — defaults to brentwood_hot + auth user email.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const toEmail = (
    typeof body.to_email === "string" && body.to_email.trim()
      ? body.to_email.trim()
      : (user.email ?? "")
  ).toLowerCase();
  const template = getPreviewTemplate(
    typeof body.template === "string" ? body.template : null,
  );

  if (!VALID_EMAIL.test(toEmail)) {
    return Response.json(
      { error: "No valid recipient — provide a to_email or set one on your account." },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // Load connection + active profile in parallel.
  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!meta?.active_profile_id) {
    return Response.json(
      { error: "No active profile — open /apps/profile and set one before previewing." },
      { status: 400 },
    );
  }

  const [{ data: connection }, { data: profile }] = await Promise.all([
    service
      .from("hl_email_connections")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("platform_profiles")
      .select("*")
      .eq("id", meta.active_profile_id)
      .maybeSingle(),
  ]);

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }
  if (!profile) {
    return Response.json({ error: "Active profile not found" }, { status: 404 });
  }

  const conn = connection as HlEmailConnection;
  if (!conn.is_active) {
    return Response.json(
      { error: "This connection is inactive — verify the domain first." },
      { status: 400 },
    );
  }
  if (conn.paused) {
    return Response.json(
      { error: conn.paused_reason ?? "Connection is paused — resume before previewing." },
      { status: 400 },
    );
  }
  if (!profile.physical_address) {
    return Response.json(
      {
        error:
          "Profile is missing a physical address (CAN-SPAM requirement). Add one in /apps/profile, then retry.",
      },
      { status: 400 },
    );
  }

  if (await isSuppressed(user.id, toEmail)) {
    return Response.json(
      {
        error: `${toEmail} is on your suppression list. Remove it (Settings → Suppression) or send to a different address.`,
      },
      { status: 400 },
    );
  }

  // Shape rows into the renderer's expected sender + branding objects.
  const sender: PlatformSenderProfile = {
    id: profile.id,
    user_id: profile.user_id,
    full_name: profile.full_name ?? profile.display_name ?? "Sender",
    title: profile.title,
    brokerage: profile.brokerage,
    phone: profile.phone,
    reply_to_email: profile.reply_to_email,
    license_number: profile.license_number,
    license_info: profile.license_info,
    regulatory_body: profile.regulatory_body,
    state: profile.state,
    physical_address: profile.physical_address,
    sign_off: profile.sign_off ?? "Talk soon,",
    is_default: profile.is_default ?? false,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };

  const branding: PlatformBrandingProfile = {
    id: profile.id,
    user_id: profile.user_id,
    name: profile.display_name ?? "Default",
    primary_color: profile.primary_color ?? "#1B7FB5",
    secondary_color: profile.secondary_color ?? "#17A697",
    accent_color: profile.accent_color ?? "#31DBA5",
    heading_font: profile.heading_font ?? "Inter, sans-serif",
    body_font: profile.body_font ?? "Inter, sans-serif",
    motifs: profile.motifs,
    corner_style: profile.corner_style ?? "soft",
    button_shape: profile.button_shape ?? "rounded",
    density: profile.density ?? "standard",
    header_treatment: profile.header_treatment ?? "solid",
    header_image_url: profile.header_image_url,
    metric_box_style: profile.metric_box_style ?? "card",
    divider_style: profile.divider_style ?? "subtle",
    logo_url: profile.logo_url,
    headshot_url: profile.headshot_url,
    brokerage_badge_url: profile.brokerage_badge_url,
    legal_disclaimer: profile.legal_disclaimer,
    is_default: profile.is_default ?? false,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };

  // Per-recipient unsubscribe link so the agent can verify it works end-to-end.
  const unsubscribeToken = await generateUnsubscribeToken(user.id, toEmail);
  const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeToken);

  // Mapbox static image — every real send includes a neighborhood map between
  // the header and metrics, so the preview must too. For non-ZIP segmentations
  // we use a representative ZIP defined on the template so the picture still
  // anchors the area visually.
  const staticMapUrl = await buildStaticMapUrl({
    zip: template.preview_map_zip,
    token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  }).catch(() => null);

  // Preview trends: pull YoY from the template's metrics.price_change_yoy
  // (already a realistic number per template), and synthesize a 3-year delta
  // as roughly 2.4x YoY to give the agent a feel for what the trend lines look.
  const previewYoy = template.metrics.price_change_yoy ?? null;
  const previewThreeYear =
    previewYoy != null ? Number((previewYoy * 2.4).toFixed(1)) : null;

  const espHandlesComplianceFooter = hasAdapter(conn.provider)
    ? getAdapter(conn.provider).capabilities.handles_compliance_footer
    : false;

  const html = renderEmailHtml({
    branding,
    sender,
    segment: template.segment,
    metrics: template.metrics,
    sellerHtml: template.sellerHtml,
    buyerHtml: template.buyerHtml,
    preheader: template.preheader,
    unsubscribeUrl,
    staticMapUrl,
    yoyPriceChangePct: previewYoy,
    threeYearPriceChangePct: previewThreeYear,
    espHandlesComplianceFooter,
  });
  const text = htmlToPlainText(html);

  const result = await dispatchEmail(conn, {
    from: {
      email: conn.email_address,
      name: sender.full_name,
    },
    reply_to: sender.reply_to_email ?? undefined,
    to: { email: toEmail },
    subject: "[PREVIEW] " + template.subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Hyperlocal-Preview": "1",
    },
    tags: {
      mode: "preview",
      connection_id: conn.id,
    },
  });

  if (!result.success) {
    return Response.json(
      { error: result.error ?? "Resend rejected the message" },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    to: toEmail,
    provider_message_id: result.provider_message_id,
  });
}
