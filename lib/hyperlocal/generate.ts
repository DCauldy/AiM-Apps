import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getHyperlocalEmailWriterModel,
  getHyperlocalSubjectModel,
} from "@/lib/openrouter";
import {
  getEmailWriterPrompt,
  getSubjectLinePrompt,
  getPreheaderPrompt,
} from "@/lib/hyperlocal/prompts";
import { renderEmailHtml, htmlToPlainText } from "@/lib/hyperlocal/email/render";
import { buildStaticMapUrl } from "@/lib/hyperlocal/map/static-map";
import { generateUnsubscribeToken } from "@/lib/hyperlocal/email/unsubscribe";
import { generateText } from "ai";
import type {
  HlCampaign,
  HlSegment,
  MlsMetrics,
  NormalizedContact,
  PlatformBrandingProfile,
  PlatformSenderProfile,
  Perspective,
  EmailProvider,
} from "@/types/hyperlocal";

// ============================================================
// runHlGenerate — load ready segments + the discovery cache, render
// one email per segment via the LLM, persist emails + recipients,
// transition the run to "review" so the agent can approve before
// sending.
//
// Pure async helper called by the Trigger.dev hlGenerateTask wrapper.
// ============================================================

interface DiscoveryCache {
  contacts: Record<string, NormalizedContact>;
  segments: Array<{
    geo_key: string;
    seller_contact_ids: string[];
    buyer_contact_ids: string[];
    contact_ids: string[];
  }>;
}

/**
 * Hard cap: how many segments we'll generate emails for in a single
 * run. If discovery + bulk-MLS produces more than this, we keep only
 * the top N by contact count and mark the rest "skipped (over cap)".
 * Prevents accidental 1000-email LLM runs.
 */
const MAX_SEGMENTS_PER_RUN = 30;

interface GenerateContext {
  runId: string;
  userId: string;
  profileId: string | null;
  campaign: HlCampaign;
  sender: PlatformSenderProfile;
  branding: PlatformBrandingProfile | null;
  segments: HlSegment[];
  cachePath: string;
  providerForRender: EmailProvider | null;
  mlsHistoryMonthsCap: number | null;
}

export interface RunHlGenerateResult {
  phase: "review" | "failed";
  segmentsGenerated: number;
  failureReason?: string;
}

export async function runHlGenerate(runId: string): Promise<RunHlGenerateResult> {
  const supabase = createServiceRoleClient();

  // ---- 1. Load context ----
  const { data: run } = await supabase
    .from("hl_runs")
    .select(
      "id, user_id, campaign_id, profile_id, sender_profile_id, branding_profile_id, email_connection_id",
    )
    .eq("id", runId)
    .single();
  if (!run) throw new Error("Run not found");

  // Resolve the run's email connection so the renderer can ask its
  // adapter whether to skip the CAN-SPAM footer.
  let providerForRender: EmailProvider | null = null;
  if (run.email_connection_id) {
    const { data: conn } = await supabase
      .from("platform_email_connections")
      .select("provider")
      .eq("id", run.email_connection_id)
      .maybeSingle();
    providerForRender = (conn?.provider as EmailProvider) ?? null;
  }

  // Sender + branding resolution: pull from platform_profiles via
  // run.profile_id (post-backfill path). Fall back is intentionally
  // not provided — runs missing profile_id throw, which surfaces
  // misconfigured runs explicitly instead of silently using stale
  // snapshots.
  let sender: Record<string, unknown> | null = null;
  let branding: Record<string, unknown> | null = null;

  if (run.profile_id) {
    const { data: pp } = await supabase
      .from("platform_profiles")
      .select("*")
      .eq("id", run.profile_id)
      .maybeSingle();
    if (pp) {
      sender = {
        id: pp.id,
        full_name: pp.full_name ?? pp.display_name,
        title: pp.title,
        brokerage: pp.brokerage,
        phone: pp.phone,
        reply_to_email: pp.reply_to_email,
        license_number: pp.license_number,
        license_info: pp.license_info,
        regulatory_body: pp.regulatory_body,
        state: pp.state,
        physical_address: pp.physical_address,
        sign_off: pp.sign_off,
      };
      branding = {
        id: pp.id,
        name: pp.display_name,
        primary_color: pp.primary_color,
        secondary_color: pp.secondary_color,
        accent_color: pp.accent_color,
        heading_font: pp.heading_font,
        body_font: pp.body_font,
        motifs: pp.motifs,
        corner_style: pp.corner_style,
        button_shape: pp.button_shape,
        density: pp.density,
        header_treatment: pp.header_treatment,
        header_image_url: pp.header_image_url,
        metric_box_style: pp.metric_box_style,
        divider_style: pp.divider_style,
        logo_url: pp.logo_url,
        headshot_url: pp.headshot_url,
        brokerage_badge_url: pp.brokerage_badge_url,
        legal_disclaimer: pp.legal_disclaimer,
      };
    }
  }

  if (!sender)
    throw new Error("Run is missing a Profile — sender identity unresolved");
  if (!branding)
    throw new Error("Run is missing a Profile — branding unresolved");

  const [{ data: campaign }, { data: allReady }] = await Promise.all([
    supabase
      .from("hl_campaigns")
      .select("*")
      .eq("id", run.campaign_id)
      .single(),
    supabase
      .from("hl_segments")
      .select("*")
      .eq("run_id", runId)
      .eq("status", "ready")
      .order("contact_count", { ascending: false }),
  ]);

  if (!campaign) throw new Error("Campaign not found");

  const readySegments = (allReady ?? []) as HlSegment[];

  // Apply hard cap — keep top N by contact count, demote the rest.
  let segments = readySegments;
  if (readySegments.length > MAX_SEGMENTS_PER_RUN) {
    const keepIds = new Set(
      readySegments.slice(0, MAX_SEGMENTS_PER_RUN).map((s) => s.id),
    );
    const demoteIds = readySegments
      .filter((s) => !keepIds.has(s.id))
      .map((s) => s.id);
    if (demoteIds.length > 0) {
      await supabase
        .from("hl_segments")
        .update({ status: "skipped" })
        .in("id", demoteIds);
    }
    segments = readySegments.slice(0, MAX_SEGMENTS_PER_RUN);
  }

  // Resolve the pack-tier MLS history cap once for the whole run.
  // Diamond → null (unlimited); everything else → numeric months.
  const { getHyperlocalUsage } = await import("@/lib/hyperlocal/usage");
  const { UNLIMITED } = await import("@/lib/hyperlocal-packs");
  const packUsage = await getHyperlocalUsage(run.user_id).catch(() => null);
  const mlsHistoryMonthsCap =
    packUsage && packUsage.mlsHistoryMonths !== UNLIMITED
      ? (packUsage.mlsHistoryMonths as number)
      : null;

  const ctx: GenerateContext = {
    runId,
    userId: run.user_id,
    profileId: run.profile_id ?? null,
    campaign: campaign as HlCampaign,
    sender: sender as unknown as PlatformSenderProfile,
    branding: branding as unknown as PlatformBrandingProfile | null,
    segments,
    cachePath: `${run.user_id}/${runId}/discovery.json`,
    providerForRender,
    mlsHistoryMonthsCap,
  };

  if (ctx.segments.length === 0) {
    await supabase
      .from("hl_runs")
      .update({
        phase: "failed",
        error: "No ready segments to generate",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      phase: "failed",
      segmentsGenerated: 0,
      failureReason: "no_ready_segments",
    };
  }

  // ---- 2. Per-segment processing — one LLM email + recipient inserts ----
  //
  // The previous Inngest version wrapped each segment in step.run for
  // per-segment retry isolation. Trigger.dev v4 makes the whole task
  // body retryable instead, and our retry budget is 1 to match the
  // old behavior — so on the rare retry, segments that already
  // inserted hl_emails rows will hit the unique constraint and the
  // task will surface that as a hard failure. Acceptable for now; we
  // can split into sub-tasks via triggerAndWait if it becomes a
  // problem.
  for (const segment of ctx.segments) {
    await processSegment(ctx, segment);
  }

  // ---- 3. Update run totals + transition to review ----
  const { count: emailsCount } = await supabase
    .from("hl_emails")
    .select("*", { count: "exact", head: true })
    .eq("run_id", runId);

  await supabase
    .from("hl_runs")
    .update({
      phase: "review",
      emails_drafted: emailsCount ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return { phase: "review", segmentsGenerated: ctx.segments.length };
}

/**
 * Generates one email for one segment, then inserts recipients.
 * Self-contained: loads the discovery cache itself and discards it.
 */
async function processSegment(
  ctx: GenerateContext,
  segment: HlSegment,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const metrics = (segment.mls_metrics as MlsMetrics | null) ?? null;

  // Every email carries BOTH a homeowner and a buyer section — same market
  // data framed two ways (matches the legacy Cowork agent). The campaign lens
  // (seller/buyer/balanced) controls which side leads and gets more weight,
  // NOT whether a section exists. A homeowner might sell, buy, or both, so we
  // never withhold a perspective.
  const perspectives: Perspective[] = ["seller", "buyer"];

  let sellerHtml: string | null = null;
  let buyerHtml: string | null = null;

  // Resolve trends once per segment (used by both renderer + writer
  // prompt) so we don't re-hit the snapshots table for each
  // perspective.
  let yoyPct: number | null = null;
  let threeYearPct: number | null = null;
  if (ctx.profileId) {
    const { getTrendsForGeo } = await import("@/lib/hyperlocal/mls/snapshots");
    const trends = await getTrendsForGeo(
      supabase,
      ctx.profileId,
      segment.geo_key,
      ctx.mlsHistoryMonthsCap,
    ).catch(() => null);
    yoyPct = trends?.yoy_price_change_pct ?? null;
    threeYearPct = trends?.three_year_price_change_pct ?? null;
  }
  const trendContext = {
    yoy_price_change_pct: yoyPct,
    three_year_price_change_pct: threeYearPct,
  };

  for (const perspective of perspectives) {
    const prompt = getEmailWriterPrompt({
      sender: ctx.sender,
      segment,
      metrics,
      perspective,
      campaign: ctx.campaign,
      trends: trendContext,
    });
    const result = await generateText({
      model: getHyperlocalEmailWriterModel(),
      prompt,
      maxOutputTokens: 800,
    });
    if (perspective === "seller") sellerHtml = result.text.trim();
    else buyerHtml = result.text.trim();
  }

  // Subject + preheader
  const subjectResult = await generateText({
    model: getHyperlocalSubjectModel(),
    prompt: getSubjectLinePrompt({ segment, metrics }),
    maxOutputTokens: 80,
  });
  const subject = subjectResult.text.trim().replace(/^["']|["']$/g, "");

  const preheaderResult = await generateText({
    model: getHyperlocalSubjectModel(),
    prompt: getPreheaderPrompt({ subject, segment }),
    maxOutputTokens: 100,
  });
  const preheader = preheaderResult.text.trim().replace(/^["']|["']$/g, "");

  // Build a static map image of this ZIP for the email. We tolerate
  // failure (returns null) so a Mapbox/GeoJSON hiccup doesn't break
  // the whole email.
  const staticMapUrl = await buildStaticMapUrl({
    zip: segment.geo_key,
    token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  }).catch(() => null);

  // Resolve the sending provider's capabilities so the renderer
  // knows whether to skip its CAN-SPAM footer (marketing ESPs append
  // their own). State-specific real estate disclosures render
  // regardless.
  const { getAdapter, hasAdapter } = await import(
    "@/lib/hyperlocal/email/providers/registry"
  );
  const connectionProvider = ctx.providerForRender;
  const espHandlesComplianceFooter =
    connectionProvider && hasAdapter(connectionProvider)
      ? getAdapter(connectionProvider).capabilities.handles_compliance_footer
      : false;

  // Render HTML — per-recipient unsubscribe placeholder is filled at
  // send time.
  const html = renderEmailHtml({
    branding: ctx.branding,
    sender: ctx.sender,
    segment,
    metrics,
    sellerHtml,
    buyerHtml,
    preheader,
    unsubscribeUrl: "{{UNSUBSCRIBE_URL}}",
    staticMapUrl,
    yoyPriceChangePct: yoyPct,
    threeYearPriceChangePct: threeYearPct,
    espHandlesComplianceFooter,
  });
  const plain = htmlToPlainText(html);

  // Insert hl_emails row
  const { data: emailRow, error: emailErr } = await supabase
    .from("hl_emails")
    .insert({
      run_id: ctx.runId,
      segment_id: segment.id,
      subject,
      preheader,
      html,
      plain_text: plain,
      seller_perspective_html: sellerHtml,
      buyer_perspective_html: buyerHtml,
      status: "draft",
    })
    .select()
    .single();
  if (emailErr) throw new Error(`insert email: ${emailErr.message}`);

  // Load discovery cache JUST for this segment's contact lookup
  const { data: blob, error: blobErr } = await supabase.storage
    .from("hyperlocal-uploads")
    .download(ctx.cachePath);
  if (blobErr || !blob) {
    throw new Error(`Could not load discovery cache: ${blobErr?.message}`);
  }
  const cache = JSON.parse(await blob.text()) as DiscoveryCache;
  const segmentCache = cache.segments.find(
    (s) => s.geo_key === segment.geo_key,
  );
  if (!segmentCache) return;

  const sellerSet = new Set(segmentCache.seller_contact_ids);
  const buyerSet = new Set(segmentCache.buyer_contact_ids);
  const recipientsToInsert: Array<Record<string, unknown>> = [];

  for (const id of segmentCache.contact_ids) {
    const contact = cache.contacts[id];
    if (!contact) continue;
    const isSeller = sellerSet.has(id);
    const isBuyer = buyerSet.has(id);
    const perspective: Perspective =
      isSeller && isBuyer ? "both" : isSeller ? "seller" : "buyer";

    const unsubscribeToken = await generateUnsubscribeToken(
      ctx.userId,
      contact.email,
    );

    recipientsToInsert.push({
      email_id: emailRow.id,
      contact_external_id: contact.external_id,
      contact_email: contact.email,
      contact_first_name: contact.first_name,
      contact_last_name: contact.last_name,
      perspective,
      unsubscribe_token: unsubscribeToken,
      send_status: "pending",
    });
  }

  if (recipientsToInsert.length === 0) return;

  // Insert in batches of 500
  const batchSize = 500;
  for (let i = 0; i < recipientsToInsert.length; i += batchSize) {
    const batch = recipientsToInsert.slice(i, i + batchSize);
    const { error: recErr } = await supabase
      .from("hl_recipients")
      .insert(batch);
    if (recErr) throw new Error(`insert recipients: ${recErr.message}`);
  }
}
