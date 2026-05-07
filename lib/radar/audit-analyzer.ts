import { generateText } from "ai";
import { getRadarAuditModel } from "@/lib/openrouter";
import { getAuditScoringPrompt } from "@/lib/radar/prompts";
import type {
  ScoringBreakdown,
  RadarAuditPage,
  PageType,
  AuditRecommendation,
} from "@/types/radar";
import type { BofuProfile } from "@/types/blog-engine";

// ---------------------------------------------------------------------------
// Rule-based signal extraction
// ---------------------------------------------------------------------------

/**
 * Extract measurable signals from raw HTML for a page.
 * Returns a partial ScoringBreakdown with rule-based scores (0-10).
 */
export function extractPageSignals(
  html: string,
  url: string
): Partial<ScoringBreakdown> {
  const signals: Partial<ScoringBreakdown> = {};

  // --- structured_data: check for Schema.org JSON-LD ---
  const hasJsonLd = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(
    html
  );
  const jsonLdCount = (
    html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/gi) || []
  ).length;

  if (jsonLdCount >= 3) signals.structured_data = 9;
  else if (jsonLdCount === 2) signals.structured_data = 7;
  else if (jsonLdCount === 1) signals.structured_data = 5;
  else if (hasJsonLd) signals.structured_data = 3;
  else signals.structured_data = 0;

  // --- content_depth: word count of visible text ---
  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = textContent.split(/\s+/).filter(Boolean).length;

  if (wordCount >= 1500) signals.content_depth = 9;
  else if (wordCount >= 800) signals.content_depth = 7;
  else if (wordCount >= 500) signals.content_depth = 5;
  else if (wordCount >= 300) signals.content_depth = 3;
  else signals.content_depth = 1;

  // --- authority_signals: author tags, about page indicators ---
  const hasAuthorMeta =
    /name=["']author["']/i.test(html) ||
    /rel=["']author["']/i.test(html);
  const hasAuthorSchema = /["']@type["']\s*:\s*["']Person["']/i.test(html);
  const hasAboutLink = /href=["'][^"']*\/about/i.test(html);
  const hasCredentials =
    /licensed|certified|years of experience|nmls|license #/i.test(textContent);

  let authorityScore = 0;
  if (hasAuthorMeta) authorityScore += 3;
  if (hasAuthorSchema) authorityScore += 3;
  if (hasAboutLink) authorityScore += 2;
  if (hasCredentials) authorityScore += 2;
  signals.authority_signals = Math.min(10, authorityScore);

  // --- crawlability: check meta robots ---
  const hasNoindex = /name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(
    html
  );
  const hasNofollow = /name=["']robots["'][^>]*content=["'][^"']*nofollow/i.test(
    html
  );
  const hasCanonical = /rel=["']canonical["']/i.test(html);
  const hasProperHeadings =
    /<h1[\s>]/i.test(html) && /<h2[\s>]/i.test(html);

  if (hasNoindex) signals.crawlability = 0;
  else if (hasNofollow) signals.crawlability = 4;
  else {
    let crawlScore = 6;
    if (hasCanonical) crawlScore += 2;
    if (hasProperHeadings) crawlScore += 2;
    signals.crawlability = Math.min(10, crawlScore);
  }

  // --- citation_potential: count specific data/stats mentions ---
  const statsPatterns = [
    /\$[\d,]+/g, // Dollar amounts
    /\d+%/g, // Percentages
    /\d{4}/g, // Years (proxy for data references)
    /median|average|according to|study|survey|report|data shows/gi,
  ];
  let statsCount = 0;
  for (const pattern of statsPatterns) {
    const matches = textContent.match(pattern);
    statsCount += matches ? matches.length : 0;
  }

  if (statsCount >= 20) signals.citation_potential = 9;
  else if (statsCount >= 10) signals.citation_potential = 7;
  else if (statsCount >= 5) signals.citation_potential = 5;
  else if (statsCount >= 2) signals.citation_potential = 3;
  else signals.citation_potential = 1;

  // --- internal_linking: count internal links ---
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = "";
  }

  const hrefMatches = html.match(/href=["']([^"']+)["']/gi) || [];
  let internalLinkCount = 0;
  for (const m of hrefMatches) {
    const hrefVal = m.match(/href=["']([^"']+)["']/i)?.[1];
    if (!hrefVal) continue;
    try {
      const linkUrl = new URL(hrefVal, url);
      if (linkUrl.hostname === domain) internalLinkCount++;
    } catch {
      // Relative URLs are internal
      if (hrefVal.startsWith("/") || hrefVal.startsWith(".")) {
        internalLinkCount++;
      }
    }
  }

  if (internalLinkCount >= 20) signals.internal_linking = 9;
  else if (internalLinkCount >= 10) signals.internal_linking = 7;
  else if (internalLinkCount >= 5) signals.internal_linking = 5;
  else if (internalLinkCount >= 2) signals.internal_linking = 3;
  else signals.internal_linking = 1;

  return signals;
}

// ---------------------------------------------------------------------------
// Page type classification
// ---------------------------------------------------------------------------

/**
 * Classify a page into a PageType based on URL patterns and content.
 */
export function classifyPageType(
  url: string,
  title: string,
  html: string
): PageType {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // Homepage — root path or index
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/" || parsed.pathname === "/index.html") {
      return "homepage";
    }
  } catch {
    // continue classification
  }

  // About page
  if (
    /\/about/i.test(lowerUrl) ||
    /\/team/i.test(lowerUrl) ||
    /about\s+(us|me)/i.test(lowerTitle)
  ) {
    return "about";
  }

  // Blog post
  if (
    /\/blog\//i.test(lowerUrl) ||
    /\/post\//i.test(lowerUrl) ||
    /\/articles?\//i.test(lowerUrl) ||
    /\/news\//i.test(lowerUrl)
  ) {
    return "blog";
  }

  // Listing page
  if (
    /\/listing/i.test(lowerUrl) ||
    /\/property/i.test(lowerUrl) ||
    /\/mls/i.test(lowerUrl) ||
    /\/homes?-for-sale/i.test(lowerUrl)
  ) {
    return "listing";
  }

  // Neighborhood / area page
  if (
    /\/neighborhood/i.test(lowerUrl) ||
    /\/area/i.test(lowerUrl) ||
    /\/community/i.test(lowerUrl) ||
    /\/communities/i.test(lowerUrl)
  ) {
    return "neighborhood";
  }

  // Service page
  if (
    /\/service/i.test(lowerUrl) ||
    /\/buyer/i.test(lowerUrl) ||
    /\/seller/i.test(lowerUrl) ||
    /\/relocation/i.test(lowerUrl) ||
    /\/financing/i.test(lowerUrl) ||
    /\/mortgage/i.test(lowerUrl)
  ) {
    return "service";
  }

  return "other";
}

// ---------------------------------------------------------------------------
// LLM-based page scoring
// ---------------------------------------------------------------------------

/**
 * Score an array of pages using the LLM for detailed analysis
 * and recommendations.
 */
export async function scorePages(
  pages: { url: string; html: string; title: string; signals: Partial<ScoringBreakdown> }[],
  profile: BofuProfile
): Promise<
  {
    url: string;
    page_type: PageType;
    score: number;
    scoring_breakdown: ScoringBreakdown;
    recommendations: AuditRecommendation[];
  }[]
> {
  // Build a summary of each page for the LLM (avoid sending full HTML for all pages)
  const pageSummaries = pages.map((p) => {
    // Extract a text snippet (first 2000 chars of visible text)
    const textContent = p.html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    return {
      url: p.url,
      title: p.title,
      page_type: classifyPageType(p.url, p.title, p.html),
      extracted_signals: p.signals,
      text_snippet: textContent,
      has_json_ld: /<script[^>]*type=["']application\/ld\+json["']/i.test(p.html),
      word_count: textContent.split(/\s+/).filter(Boolean).length,
    };
  });

  // Process in batches of 10 to stay within token limits
  const BATCH_SIZE = 10;
  const allResults: {
    url: string;
    page_type: PageType;
    score: number;
    scoring_breakdown: ScoringBreakdown;
    recommendations: AuditRecommendation[];
  }[] = [];

  for (let i = 0; i < pageSummaries.length; i += BATCH_SIZE) {
    const batch = pageSummaries.slice(i, i + BATCH_SIZE);
    const batchPages = pages.slice(i, i + BATCH_SIZE);

    const userMessage = `## Professional Context
- Name: ${profile.full_name}
- Type: ${profile.professional_type}
- Market: ${profile.metro_area}, ${profile.state}
- Website: ${profile.website_url || "N/A"}

## Pages to Analyze
${JSON.stringify(batch, null, 2)}

Score each page and provide specific, actionable recommendations. Use the extracted signals as a baseline but adjust scores based on the actual content quality and AI readiness.`;

    try {
      const { text } = await generateText({
        model: getRadarAuditModel(),
        system: getAuditScoringPrompt(),
        prompt: userMessage,
      });

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const item of parsed) {
          allResults.push({
            url: item.url,
            page_type: item.page_type || "other",
            score: item.score,
            scoring_breakdown: item.scoring_breakdown,
            recommendations: item.recommendations || [],
          });
        }
        continue;
      }
    } catch (err) {
      console.error(`[Radar Audit] Batch ${i / BATCH_SIZE + 1} LLM error:`, err);
    }

    // Fallback for this batch: use rule-based scores
    for (const p of batchPages) {
      const pageType = classifyPageType(p.url, p.title, p.html);
      const breakdown: ScoringBreakdown = {
        structured_data: p.signals.structured_data ?? 0,
        content_depth: p.signals.content_depth ?? 0,
        authority_signals: p.signals.authority_signals ?? 0,
        crawlability: p.signals.crawlability ?? 0,
        citation_potential: p.signals.citation_potential ?? 0,
        internal_linking: p.signals.internal_linking ?? 0,
      };
      const values = Object.values(breakdown);
      const avgScore = values.reduce((sum, v) => sum + v, 0) / values.length;

      allResults.push({
        url: p.url,
        page_type: pageType,
        score: Math.round(avgScore * 10) / 10,
        scoring_breakdown: breakdown,
        recommendations: [],
      });
    }
  }

  return allResults;
}
