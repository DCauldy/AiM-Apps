import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  acAuthFromConnection,
  acV1,
} from "@/lib/hyperlocal/email/providers/activecampaign-client";
import { getPreviewTemplate } from "@/lib/hyperlocal/email/preview-templates";
import { renderEmailHtml, htmlToPlainText } from "@/lib/hyperlocal/email/render";
import { buildStaticMapUrl } from "@/lib/hyperlocal/map/static-map";
import { isSuppressed } from "@/lib/hyperlocal/email/suppressions";
import {
  getPlatformEmailConnection,
  getAppEmailConnectionStateInternal,
} from "@/lib/platform/connections";
import type { HlEmailAppMetadata } from "@/types/platform-connections";
import { NextRequest } from "next/server";
import type {
  PlatformBrandingProfile,
  PlatformSenderProfile,
} from "@/types/hyperlocal";

export const dynamic = "force-dynamic";

// ============================================================
// ActiveCampaign test-send.
//
// AC's modern v3 API has no direct "send this campaign as a test"
// endpoint. The supported pattern is:
//
//   1. POST /api/3/messages       — create message (from, subject, html, list)
//   2. POST /api/3/campaigns      — create draft campaign (type:single, list)
//   3. GET  /admin/api.php?api_action=campaign_send&action=test
//      …with campaignid + messageid + email — fires the test send (v1 API
//      is still supported on every account; it's the canonical test path).
//   4. DELETE /api/3/campaigns/{id} + /messages/{id} — best-effort cleanup.
//
// Rendering uses espHandlesComplianceFooter=true since AC appends its
// own CAN-SPAM footer + unsubscribe link on every send.
// ============================================================

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const [conn, state, { data: profile }] = await Promise.all([
    getPlatformEmailConnection(service, user.id, id),
    getAppEmailConnectionStateInternal(service, "hyperlocal", id),
    service
      .from("platform_profiles")
      .select("*")
      .eq("id", meta.active_profile_id)
      .maybeSingle(),
  ]);

  if (!conn || conn.provider !== "activecampaign") {
    return Response.json({ error: "ActiveCampaign connection not found" }, { status: 404 });
  }
  if (!profile) {
    return Response.json({ error: "Active profile not found" }, { status: 404 });
  }
  const metadata = (state?.provider_metadata ?? {}) as HlEmailAppMetadata;

  if (!conn.is_active) {
    return Response.json(
      { error: "This connection is inactive — reconnect under Settings → Email." },
      { status: 400 },
    );
  }
  if (state?.paused) {
    return Response.json(
      { error: state.paused_reason ?? "Connection is paused — resume before previewing." },
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

  let auth;
  try {
    auth = acAuthFromConnection(conn, metadata);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "ActiveCampaign auth failed" },
      { status: 400 },
    );
  }
  if (!auth.listId) {
    return Response.json(
      { error: "No list selected — pick one in Settings → Email → ActiveCampaign." },
      { status: 400 },
    );
  }

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

  const staticMapUrl = await buildStaticMapUrl({
    zip: template.preview_map_zip,
    token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  }).catch(() => null);

  const previewYoy = template.metrics.price_change_yoy ?? null;
  const previewThreeYear =
    previewYoy != null ? Number((previewYoy * 2.4).toFixed(1)) : null;

  const html = renderEmailHtml({
    branding,
    sender,
    segment: template.segment,
    metrics: template.metrics,
    sellerHtml: template.sellerHtml,
    buyerHtml: template.buyerHtml,
    preheader: template.preheader,
    // AC injects its own footer + unsubscribe; skip ours to avoid double disclosures.
    unsubscribeUrl: "",
    staticMapUrl,
    yoyPriceChangePct: previewYoy,
    threeYearPriceChangePct: previewThreeYear,
    espHandlesComplianceFooter: true,
  });
  const text = htmlToPlainText(html);

  const fromName = (conn.display_name ?? sender.full_name ?? "Sender").trim();
  const replyTo =
    (sender.reply_to_email?.includes("@") ? sender.reply_to_email : null) ||
    (conn.email_address.includes("@") && !conn.email_address.startsWith("activecampaign:")
      ? conn.email_address
      : null);
  if (!replyTo) {
    return Response.json(
      {
        error:
          "ActiveCampaign needs a from-address but none is configured. Set your profile reply-to email in /apps/profile, then retry.",
      },
      { status: 400 },
    );
  }

  // ---- Create message → create campaign → test-send → cleanup ----
  // Whole flow uses v1 — AC's v3 has 405s on POST /campaigns and v3
  // messages aren't always recognized by v1 campaign_create (it expects
  // messages created via the matching v1 endpoint). Going all-v1 keeps
  // the resources in the same address space.
  const timestamp = new Date().toISOString();
  let messageId: string | null = null;
  let campaignId: string | null = null;
  try {
    const messageRes = await acV1<{ id?: string }>(auth, "message_add", {
      format: "mime",
      subject: "[PREVIEW] " + template.subject,
      fromemail: replyTo,
      fromname: fromName,
      reply2: replyTo,
      priority: 3,
      charset: "utf-8",
      encoding: "quoted-printable",
      htmlfetch: "",
      textfetch: "",
      htmlconstructor: 1,
      template: 0,
      html,
      text,
      [`p[${auth.listId}]`]: auth.listId,
    });
    if (!messageRes.ok) {
      throw new Error(translateAcError(messageRes.raw, "message create"));
    }
    messageId = messageRes.json?.id ?? null;
    if (!messageId) throw new Error("AC didn't return a message id");

    // Campaign create — v1 uses bracketed param keys:
    //   m[<messageId>]=100  (message-weight map, must sum to 100)
    //   p[<listId>]=<listId> (list to target — value mirrors the key)
    // sdate is required even for drafts (status=0); now-ish is fine.
    const campaignRes = await acV1<{ id?: string }>(auth, "campaign_create", {
      type: "single",
      name: `Hyperlocal Test — ${timestamp}`,
      sdate: timestamp.replace("T", " ").slice(0, 19),
      status: 0,
      public: 0,
      tracklinks: "none",
      [`m[${messageId}]`]: 100,
      [`p[${auth.listId}]`]: auth.listId,
    });
    if (!campaignRes.ok) {
      throw new Error(translateAcError(campaignRes.raw, "campaign create"));
    }
    campaignId = campaignRes.json?.id ?? null;
    if (!campaignId) throw new Error("AC didn't return a campaign id");

    const testResult = await acV1(auth, "campaign_send", {
      campaignid: campaignId,
      messageid: messageId,
      type: "html",
      action: "test",
      email: toEmail,
    });
    if (!testResult.ok) {
      throw new Error(translateAcError(testResult.raw, "test send"));
    }
  } catch (e) {
    // Cleanup whatever we created so the AC account doesn't fill up with drafts.
    // Campaign cleanup is v1 (matches creation); message cleanup is v3
    // (POST /messages worked, so DELETE /messages/{id} should too).
    if (campaignId) {
      await acV1(auth, "campaign_delete", { id: campaignId }).catch(() => {});
    }
    if (messageId) {
      await acV1(auth, "message_delete", { id: messageId }).catch(() => {});
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "ActiveCampaign test send failed" },
      { status: 500 },
    );
  }

  // Happy-path cleanup — best-effort.
  await acV1(auth, "campaign_delete", { id: campaignId }).catch(() => {});
  await acV1(auth, "message_delete", { id: messageId }).catch(() => {});

  return Response.json({
    success: true,
    to: toEmail,
    note:
      "Sent via ActiveCampaign's v1 campaign_send (action=test). Subject is prefixed '[PREVIEW]'. " +
      "Footer + unsubscribe injected by AC, not Hyperlocal.",
  });
}

/** Surface the most common AC config-level rejections as actionable
 *  hints. Falls back to the raw response body so we never hide a novel
 *  error from the agent or future debugging. */
function translateAcError(raw: string, stage: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("mailing address")) {
    return (
      "ActiveCampaign requires a physical mailing address on your account before campaigns can be created (CAN-SPAM). " +
      "Set one in AC → Settings → Advanced → Mailing Address, then retry."
    );
  }
  if (lower.includes("verified") || lower.includes("not allowed")) {
    return (
      "ActiveCampaign rejected the from-address as unverified. " +
      "Verify your sender email under AC → Settings → Advanced → Email, then retry."
    );
  }
  if (lower.includes("8 campaigns") || lower.includes("sent at least")) {
    return (
      "ActiveCampaign blocks API sends until you've sent at least 8 campaigns " +
      "through their web interface (anti-abuse trust gate for new accounts). " +
      "Send a few campaigns manually in AC first, then retry."
    );
  }
  return `ActiveCampaign rejected ${stage}: ${raw.slice(0, 600)}`;
}
