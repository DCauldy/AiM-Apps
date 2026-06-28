import type {
  HlCampaign,
  HlSegment,
  MlsMetrics,
  PlatformSenderProfile,
  Perspective,
} from "@/types/hyperlocal";

function formatMoney(n?: number): string {
  if (n == null) return "N/A";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

function formatMetrics(m: MlsMetrics | null | undefined): string {
  if (!m) return "(no metrics computed yet)";
  const lines: string[] = [];
  if (m.median_sale_price)
    lines.push(`- Median sale price: ${formatMoney(m.median_sale_price)}`);
  if (m.median_days_on_market)
    lines.push(`- Median days on market: ${m.median_days_on_market}`);
  if (m.list_to_sale_ratio)
    lines.push(`- List-to-sale ratio: ${m.list_to_sale_ratio}%`);
  if (m.inventory_active)
    lines.push(`- Active listings: ${m.inventory_active}`);
  if (m.closed_last_30_days)
    lines.push(`- Closed in last 30 days: ${m.closed_last_30_days}`);
  if (m.closed_last_90_days)
    lines.push(`- Closed in last 90 days: ${m.closed_last_90_days}`);
  if (m.new_listings_last_30_days)
    lines.push(`- New listings (30d): ${m.new_listings_last_30_days}`);
  return lines.length > 0 ? lines.join("\n") : "(no metrics available)";
}

const PERSPECTIVE_GUIDANCE: Record<Perspective, string> = {
  seller: `This section is for homeowners in the area. Focus on what the data says about the seller side: how prices have moved, days on market, and what it means for someone thinking about selling. Be candid about the market — buyers reading this aren't your audience for this section.`,
  buyer: `This section is for buyers who have flagged interest in this area. Focus on inventory, pricing trends from a buyer's perspective, and what the market looks like for someone shopping right now. Don't sugarcoat — be honest about competition and price moves.`,
  both: `Write a balanced section that speaks to both potential sellers and buyers, but stay grounded in the data.`,
};

/** Optional trend context derived from hl_market_snapshots. When omitted the
 *  prompt simply doesn't reference trends — the writer falls back to the
 *  current-month metrics only. */
export interface TrendContext {
  yoy_price_change_pct: number | null;
  three_year_price_change_pct: number | null;
}

function formatTrends(t: TrendContext | undefined): string {
  if (!t) return "";
  const lines: string[] = [];
  if (t.yoy_price_change_pct != null) {
    const dir = t.yoy_price_change_pct > 0 ? "up" : t.yoy_price_change_pct < 0 ? "down" : "flat";
    lines.push(
      `- Median sale ${dir} ${Math.abs(t.yoy_price_change_pct).toFixed(1)}% YoY (vs same month last year)`,
    );
  }
  if (t.three_year_price_change_pct != null) {
    const dir = t.three_year_price_change_pct > 0 ? "up" : t.three_year_price_change_pct < 0 ? "down" : "flat";
    lines.push(
      `- Median sale ${dir} ${Math.abs(t.three_year_price_change_pct).toFixed(1)}% over the last 3 years`,
    );
  }
  if (lines.length === 0) return "";
  return `\n\nTREND CONTEXT — weave one of these naturally if it strengthens the story; never both:\n${lines.join("\n")}`;
}

/** Human phrase for the data scope (price band + home type) so the writer
 *  frames the numbers honestly — "based on single-family homes $300–500K". */
function formatScope(
  campaign: Pick<
    HlCampaign,
    "property_type_filters" | "price_range_low" | "price_range_high"
  >,
): string {
  const typeMap: Record<string, string> = {
    single_family: "single-family homes",
    condo: "condos",
    townhome: "townhomes",
  };
  const types = (campaign.property_type_filters ?? [])
    .map((t) => typeMap[t])
    .filter(Boolean);
  const typePhrase = types.length > 0 ? types.join(" and ") : "homes";
  const lo = campaign.price_range_low;
  const hi = campaign.price_range_high;
  let pricePhrase = "";
  if (lo && hi) pricePhrase = ` priced ${formatMoney(lo)}–${formatMoney(hi)}`;
  else if (lo) pricePhrase = ` priced ${formatMoney(lo)}+`;
  else if (hi) pricePhrase = ` priced under ${formatMoney(hi)}`;
  if (typePhrase === "homes" && !pricePhrase) return "";
  return `\n\nDATA SCOPE: These numbers reflect ${typePhrase}${pricePhrase} in the area — frame the story around that slice (e.g. "for ${typePhrase}${pricePhrase} here…"). Don't imply it covers every property.`;
}

export function getEmailWriterPrompt(opts: {
  sender: PlatformSenderProfile | null;
  segment: HlSegment;
  metrics: MlsMetrics | null;
  perspective: Perspective;
  campaign: Pick<
    HlCampaign,
    "lens" | "property_type_filters" | "price_range_low" | "price_range_high"
  >;
  trends?: TrendContext;
}): string {
  const { sender, segment, metrics, perspective, campaign, trends } = opts;
  const senderBlock = sender
    ? `Sender: ${sender.full_name}${sender.title ? `, ${sender.title}` : ""}${sender.brokerage ? `, ${sender.brokerage}` : ""}.`
    : "Sender details will be appended.";

  // The email always contains both sections; the campaign lens decides which
  // one LEADS and carries more weight. A section that matches the lens is the
  // hero (fuller, more detailed); the off-lens section is a tighter companion.
  const isLead =
    campaign.lens === "balanced" || campaign.lens === perspective;
  const emphasisNote =
    campaign.lens === "balanced"
      ? `EMPHASIS: Balanced campaign — give this section equal weight to its counterpart.`
      : isLead
        ? `EMPHASIS: This campaign leans ${campaign.lens}, so this is the LEAD section — make it the fuller, more detailed half of the email.`
        : `EMPHASIS: This campaign leans ${campaign.lens}, so this section is the shorter companion to the lead — keep it tight and complementary, not competing.`;
  const lengthGuide = isLead ? "120–180 words" : "60–100 words";

  return `You are writing one section of a hyperlocal market report email for the ${segment.geo_label || segment.geo_key} area. The full email contains BOTH a homeowner section and a buyer section drawn from the same data — you are writing the ${perspective} section. ${senderBlock}

CAMPAIGN LENS: ${campaign.lens}
SECTION PERSPECTIVE: ${perspective}
${emphasisNote}

${PERSPECTIVE_GUIDANCE[perspective]}

REAL MARKET DATA — do not invent numbers, only use what's here:
${formatMetrics(metrics)}${formatTrends(trends)}${formatScope(campaign)}

OUTPUT FORMAT: clean HTML, no <html> or <body> wrapper. Use <p>, <strong>, <em>, and one <ul> if you call out 2–4 data points as bullets. NO emojis. NO marketing fluff. Sound like a knowledgeable agent texting a neighbor, not a brochure.

LENGTH: ${lengthGuide} for this section.

TONE: Conversational, confident, specific. Cite the actual numbers above. Add brief context for what the numbers mean (e.g. "a 12-day DOM means homes are moving fast"). End with a single soft CTA — something like "happy to share what I'm seeing on the ground" — not a hard sell.

OUTPUT: ONLY the HTML for this section. No preamble.`;
}

export function getSubjectLinePrompt(opts: {
  segment: HlSegment;
  metrics: MlsMetrics | null;
}): string {
  const { segment, metrics } = opts;
  return `Write a short, specific subject line for a hyperlocal market-report email about ${segment.geo_label || segment.geo_key}.

DATA:
${formatMetrics(metrics)}

REQUIREMENTS:
- 45 characters or fewer (mobile preview limit)
- Reference a specific number from the data if possible
- No clickbait, no "BREAKING", no all caps, no emoji
- Sound like a quick neighborly heads-up, not a marketing blast

Examples of good style:
- "Brentwood update — median up $42K since spring"
- "37027: 12 days on market, here's why"
- "What's selling in Franklin right now"

OUTPUT: ONLY the subject line text. No quotes, no preamble.`;
}

export function getPreheaderPrompt(opts: {
  subject: string;
  segment: HlSegment;
}): string {
  return `Write the preheader (Gmail preview snippet) for an email with the subject "${opts.subject}" about ${opts.segment.geo_label || opts.segment.geo_key}.

REQUIREMENTS:
- 60–90 characters
- Complements (doesn't repeat) the subject line
- Adds one specific number or fact teaser
- Same conversational tone as the subject

OUTPUT: ONLY the preheader text. No quotes, no preamble.`;
}
