import { createServiceRoleClient } from "@/lib/supabase/server";
import { renderEmailHtml, htmlToPlainText } from "./render";
import { buildStaticMapUrl } from "@/lib/hyperlocal/map/static-map";
import { getTrendsForGeo } from "@/lib/hyperlocal/mls/snapshots";
import { getHyperlocalUsage } from "@/lib/hyperlocal/usage";
import { UNLIMITED } from "@/lib/hyperlocal-packs";
import { getAdapter, hasAdapter } from "./providers/registry";
import type { EmailProvider } from "@/types/hyperlocal";
import type {
  HlEmail,
  HlSegment,
  PlatformBrandingProfile,
  PlatformSenderProfile,
  MlsMetrics,
} from "@/types/hyperlocal";

/**
 * Re-render an email's HTML + plain_text from its current block fields
 * (subject, preheader, seller_perspective_html, buyer_perspective_html) and
 * the run's sender + branding. Returns the regenerated strings — caller
 * persists them.
 *
 * Used by:
 *   - the PATCH endpoint when a user edits a block manually
 *   - the AI chat endpoint after an LLM-driven block edit
 */
export async function rerenderEmail(emailId: string): Promise<{
  html: string;
  plain_text: string;
}> {
  const supabase = createServiceRoleClient();

  const { data: email } = await supabase
    .from("hl_emails")
    .select(
      "id, run_id, segment_id, subject, preheader, seller_perspective_html, buyer_perspective_html"
    )
    .eq("id", emailId)
    .single();
  if (!email) throw new Error("Email not found");

  const { data: segment } = await supabase
    .from("hl_segments")
    .select("*")
    .eq("id", email.segment_id)
    .single();
  if (!segment) throw new Error("Segment not found");

  const { data: run } = await supabase
    .from("hl_runs")
    .select("profile_id, email_connection_id, user_id")
    .eq("id", email.run_id)
    .single();
  if (!run?.profile_id) throw new Error("Run profile not set — cannot re-render");

  // Resolve the sending provider's footer-handling capability so re-renders
  // stay consistent with what the run will actually send through.
  let espHandlesComplianceFooter = false;
  if (run.email_connection_id) {
    const { data: conn } = await supabase
      .from("hl_email_connections")
      .select("provider")
      .eq("id", run.email_connection_id)
      .maybeSingle();
    const provider = conn?.provider as EmailProvider | undefined;
    if (provider && hasAdapter(provider)) {
      espHandlesComplianceFooter =
        getAdapter(provider).capabilities.handles_compliance_footer;
    }
  }

  const { data: profile } = await supabase
    .from("platform_profiles")
    .select("*")
    .eq("id", run.profile_id)
    .single();
  if (!profile) throw new Error("Profile not found — cannot re-render email");

  // Shape into the Sender + Branding objects the renderer expects.
  const sender = {
    id: profile.id,
    full_name: profile.full_name ?? profile.display_name,
    title: profile.title,
    brokerage: profile.brokerage,
    phone: profile.phone,
    reply_to_email: profile.reply_to_email,
    license_number: profile.license_number,
    license_info: profile.license_info,
    regulatory_body: profile.regulatory_body,
    state: profile.state,
    physical_address: profile.physical_address,
    sign_off: profile.sign_off,
  };
  const branding = {
    id: profile.id,
    name: profile.display_name,
    primary_color: profile.primary_color,
    secondary_color: profile.secondary_color,
    accent_color: profile.accent_color,
    heading_font: profile.heading_font,
    body_font: profile.body_font,
    motifs: profile.motifs,
    corner_style: profile.corner_style,
    button_shape: profile.button_shape,
    density: profile.density,
    header_treatment: profile.header_treatment,
    header_image_url: profile.header_image_url,
    metric_box_style: profile.metric_box_style,
    divider_style: profile.divider_style,
    logo_url: profile.logo_url,
    headshot_url: profile.headshot_url,
    brokerage_badge_url: profile.brokerage_badge_url,
    legal_disclaimer: profile.legal_disclaimer,
  };

  const staticMapUrl = await buildStaticMapUrl({
    zip: (segment as HlSegment).geo_key,
    token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  }).catch(() => null);

  // Pack-tier MLS history cap. Diamond is UNLIMITED → no cap; everything
  // else clamps how far back trends can pull from.
  const packUsage = run.user_id
    ? await getHyperlocalUsage(run.user_id).catch(() => null)
    : null;
  const historyCap =
    packUsage && packUsage.mlsHistoryMonths !== UNLIMITED
      ? (packUsage.mlsHistoryMonths as number)
      : null;

  const trends = await getTrendsForGeo(
    supabase,
    run.profile_id,
    (segment as HlSegment).geo_key,
    historyCap,
  ).catch(() => null);

  const html = renderEmailHtml({
    branding: branding as PlatformBrandingProfile | null,
    sender: sender as PlatformSenderProfile,
    segment: segment as HlSegment,
    metrics: (segment.mls_metrics as MlsMetrics | null) ?? null,
    sellerHtml: email.seller_perspective_html,
    buyerHtml: email.buyer_perspective_html,
    preheader: email.preheader ?? "",
    // Token placeholder — replaced per-recipient at send time
    unsubscribeUrl: "{{UNSUBSCRIBE_URL}}",
    staticMapUrl,
    yoyPriceChangePct: trends?.yoy_price_change_pct ?? null,
    threeYearPriceChangePct: trends?.three_year_price_change_pct ?? null,
    espHandlesComplianceFooter,
  });
  return { html, plain_text: htmlToPlainText(html) };
}

/** Shape of the four editable blocks. */
export interface DraftBlocks {
  subject: string;
  preheader: string;
  seller_perspective_html: string | null;
  buyer_perspective_html: string | null;
}

/** Snapshot the current block values for one-step undo. */
export function snapshotBlocks(
  email: Pick<
    HlEmail,
    "subject" | "preheader" | "seller_perspective_html" | "buyer_perspective_html"
  >
): DraftBlocks {
  return {
    subject: email.subject ?? "",
    preheader: email.preheader ?? "",
    seller_perspective_html: email.seller_perspective_html ?? null,
    buyer_perspective_html: email.buyer_perspective_html ?? null,
  };
}
