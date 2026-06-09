import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  mcAuthFromConnection,
  mcRequest,
} from "@/lib/hyperlocal/email/providers/mailchimp-client";
import { getPreviewTemplate } from "@/lib/hyperlocal/email/preview-templates";
import { renderEmailHtml, htmlToPlainText } from "@/lib/hyperlocal/email/render";
import { buildStaticMapUrl } from "@/lib/hyperlocal/map/static-map";
import { isSuppressed } from "@/lib/hyperlocal/email/suppressions";
import { NextRequest } from "next/server";
import type {
  HlEmailConnection,
  PlatformBrandingProfile,
  PlatformSenderProfile,
} from "@/types/hyperlocal";

export const dynamic = "force-dynamic";

// ============================================================
// Mailchimp test-send — the campaign-mode equivalent of /preview-send.
//
// Why a separate route: dispatchEmail() hard-fails for campaign-mode
// providers (Mailchimp has no transactional send). To preview a Mailchimp
// design we have to go through their actual delivery infrastructure so
// the agent sees the real-world result: Mailchimp's footer, their
// unsub link, mail relayed from their IPs.
//
// Flow:
//   1. Render HTML with espHandlesComplianceFooter=true (Mailchimp will
//      append its own footer + unsubscribe).
//   2. POST /campaigns — draft against the connected audience, no
//      segment targeting (test sends bypass recipient resolution).
//   3. PUT  /campaigns/{id}/content — attach the HTML + plaintext.
//   4. POST /campaigns/{id}/actions/test — Mailchimp delivers a single
//      copy to test_emails[], stamped "[TEST]" on the subject.
//   5. DELETE /campaigns/{id} (best-effort) — keep the agent's Mailchimp
//      UI clean. Failure to delete is non-fatal; the draft just lingers.
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

  const [{ data: connection }, { data: profile }] = await Promise.all([
    service
      .from("hl_email_connections")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("provider", "mailchimp")
      .maybeSingle(),
    service
      .from("platform_profiles")
      .select("*")
      .eq("id", meta.active_profile_id)
      .maybeSingle(),
  ]);

  if (!connection) {
    return Response.json({ error: "Mailchimp connection not found" }, { status: 404 });
  }
  if (!profile) {
    return Response.json({ error: "Active profile not found" }, { status: 404 });
  }

  const conn = connection as HlEmailConnection;
  if (!conn.is_active) {
    return Response.json(
      { error: "This connection is inactive — reconnect under Settings → Email." },
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

  let auth;
  try {
    auth = mcAuthFromConnection(conn);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Mailchimp auth failed" },
      { status: 400 },
    );
  }
  if (!auth.audienceId) {
    return Response.json(
      { error: "No audience selected — pick one in Settings → Email → Mailchimp." },
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
    // Mailchimp injects its own footer + unsubscribe; the renderer
    // skips ours when this flag is true so unsubscribeUrl is unused.
    unsubscribeUrl: "",
    staticMapUrl,
    yoyPriceChangePct: previewYoy,
    threeYearPriceChangePct: previewThreeYear,
    espHandlesComplianceFooter: true,
  });
  const text = htmlToPlainText(html);

  // Pull the audience's campaign_defaults — Mailchimp populates this when the
  // audience is created and the email is guaranteed to be verified for
  // sending. Using it sidesteps the most common 400 ("from_email not
  // verified") that hits when we use the OAuth account's login email,
  // which may not be authenticated for sending campaigns.
  let listDefaults: {
    from_name?: string;
    from_email?: string;
    subject?: string;
  } = {};
  try {
    const listInfo = await mcRequest<{
      campaign_defaults?: {
        from_name?: string;
        from_email?: string;
        subject?: string;
      };
    }>(
      auth,
      "GET",
      `/lists/${auth.audienceId}?fields=campaign_defaults`,
    );
    listDefaults = listInfo.campaign_defaults ?? {};
  } catch {
    // Non-fatal — fall through to the connection-level values. If those
    // are also bad, Mailchimp's 400 will be surfaced with the full body.
  }

  const fromName =
    listDefaults.from_name?.trim() ||
    conn.display_name?.trim() ||
    sender.full_name.trim() ||
    "Sender";
  const replyTo =
    listDefaults.from_email?.trim() ||
    (sender.reply_to_email?.includes("@") ? sender.reply_to_email : null) ||
    (conn.email_address.includes(":") ? null : conn.email_address);

  if (!replyTo) {
    return Response.json(
      {
        error:
          "Mailchimp needs a verified from-address but couldn't find one. " +
          "Set the audience's default from-email in Mailchimp (Audience → Settings → Audience name and defaults), then retry.",
      },
      { status: 400 },
    );
  }

  // ---- Mailchimp campaign create → set content → test-send → cleanup ----
  let campaignId: string | null = null;
  try {
    const campaign = await mcRequest<{ id: string }>(auth, "POST", "/campaigns", {
      type: "regular",
      recipients: {
        list_id: auth.audienceId,
        // No segment_opts — test sends bypass recipient targeting entirely.
      },
      settings: {
        subject_line: "[PREVIEW] " + template.subject,
        preview_text: template.preheader,
        title: `Hyperlocal Test — ${new Date().toISOString()}`,
        from_name: fromName,
        reply_to: replyTo,
        // Skip to_name merge tags for test sends — the test recipient may
        // not exist as a list member, which would null-out *|FNAME|*.
      },
    });
    campaignId = campaign.id;

    await mcRequest<unknown>(auth, "PUT", `/campaigns/${campaignId}/content`, {
      html,
      plain_text: text,
    });

    await mcRequest<unknown>(
      auth,
      "POST",
      `/campaigns/${campaignId}/actions/test`,
      {
        test_emails: [toEmail],
        send_type: "html",
      },
    );
  } catch (e) {
    // If the campaign was created but content/test failed, still try to
    // clean it up so we don't leave drafts behind.
    if (campaignId) {
      await mcRequest(auth, "DELETE", `/campaigns/${campaignId}`).catch(() => {});
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Mailchimp test send failed" },
      { status: 500 },
    );
  }

  // Best-effort cleanup — Mailchimp UI stays tidy if this works, but the
  // test send already happened so we never block on a failed delete.
  await mcRequest(auth, "DELETE", `/campaigns/${campaignId}`).catch(() => {});

  return Response.json({
    success: true,
    to: toEmail,
    note:
      "Sent via Mailchimp. Subject lands as '[TEST] [PREVIEW] …' — Mailchimp prefixes test sends. " +
      "Footer + unsubscribe link are injected by Mailchimp, not Hyperlocal.",
  });
}
