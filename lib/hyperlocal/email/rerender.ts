import { createServiceRoleClient } from "@/lib/supabase/server";
import { renderEmailHtml, htmlToPlainText } from "./render";
import { buildStaticMapUrl } from "@/lib/hyperlocal/map/static-map";
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
    .select("sender_profile_id, branding_profile_id")
    .eq("id", email.run_id)
    .single();
  if (!run) throw new Error("Run not found");

  const [{ data: sender }, { data: branding }] = await Promise.all([
    run.sender_profile_id
      ? supabase
          .from("platform_sender_profiles")
          .select("*")
          .eq("id", run.sender_profile_id)
          .single()
      : Promise.resolve({ data: null }),
    run.branding_profile_id
      ? supabase
          .from("platform_branding_profiles")
          .select("*")
          .eq("id", run.branding_profile_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  if (!sender) {
    throw new Error("Sender profile required to re-render email");
  }

  const staticMapUrl = await buildStaticMapUrl({
    zip: (segment as HlSegment).geo_key,
    token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  }).catch(() => null);

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
