import { createServiceRoleClient } from "@/lib/supabase/server";
import { crawlWebsite } from "@/lib/radar/crawler";
import {
  extractPageSignals,
  classifyPageType,
  scorePages,
} from "@/lib/radar/audit-analyzer";
import type { CrawledPage, ScoringBreakdown, PageType, AuditRecommendation } from "@/types/radar";
import type { BofuProfile } from "@/types/blog-engine";

interface RunAuditInput {
  userId: string;
  url: string;
}

/**
 * Standalone radar audit function for dev mode (bypasses Inngest).
 * Mirrors the logic in lib/inngest/functions/radar-audit.ts.
 */
export async function runRadarAudit({ userId, url }: RunAuditInput) {
  const supabase = createServiceRoleClient();

  // Step 1: Create audit record
  const { data: audit, error: auditError } = await supabase
    .from("radar_audits")
    .insert({
      user_id: userId,
      url_crawled: url,
      status: "crawling",
      pages_found: 0,
      pages_analyzed: 0,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (auditError || !audit) {
    throw new Error(`Failed to create audit: ${auditError?.message}`);
  }

  try {
    // Step 2: Crawl website
    const crawledPages = await crawlWebsite(url, 50);

    await supabase
      .from("radar_audits")
      .update({
        status: "analyzing",
        pages_found: crawledPages.length,
      })
      .eq("id", audit.id);

    if (crawledPages.length === 0) {
      await supabase
        .from("radar_audits")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", audit.id);

      return { success: false, auditId: audit.id, reason: "no_pages_crawled" };
    }

    // Step 3: Extract signals from each page
    const pagesWithSignals = (crawledPages as CrawledPage[]).map((page) => {
      const signals = extractPageSignals(page.html, page.url);
      const pageType = classifyPageType(page.url, page.title, page.html);
      return {
        url: page.url,
        html: page.html,
        title: page.title,
        signals,
        pageType,
      };
    });

    // Step 4: Score pages
    let scoredPages: Array<{
      url: string;
      page_type: PageType;
      score: number;
      scoring_breakdown: ScoringBreakdown;
      recommendations: AuditRecommendation[];
    }>;

    // Read identity from the user's active Profile (the audit only consumes a
    // few fields — full_name, brokerage, metro_area, website_url —
    // which all exist on platform_profiles).
    const { data: userMeta } = await supabase
      .from("profiles")
      .select("active_profile_id")
      .eq("id", userId)
      .maybeSingle();
    const { data: profile } = userMeta?.active_profile_id
      ? await supabase
          .from("platform_profiles")
          .select("*")
          .eq("id", userMeta.active_profile_id)
          .maybeSingle()
      : { data: null };

    if (!profile) {
      scoredPages = pagesWithSignals.map((p) => {
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

        return {
          url: p.url,
          page_type: p.pageType,
          score: Math.round(avgScore * 10) / 10,
          scoring_breakdown: breakdown,
          recommendations: [],
        };
      });
    } else {
      scoredPages = await scorePages(
        pagesWithSignals.map((p) => ({
          url: p.url,
          html: p.html,
          title: p.title,
          signals: p.signals,
        })),
        profile as BofuProfile
      );
    }

    // Step 5: Save audit pages
    const rows = scoredPages.map((page) => ({
      audit_id: audit.id,
      user_id: userId,
      url: page.url,
      page_type: page.page_type,
      title: pagesWithSignals.find((p) => p.url === page.url)?.title || null,
      score: page.score,
      scoring_breakdown: page.scoring_breakdown,
      recommendations: page.recommendations,
      is_blog: page.page_type === "blog",
    }));

    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase.from("radar_audit_pages").insert(batch);
      if (error) {
        console.error(`[Radar Audit] Failed to save pages batch ${i}:`, error);
      }
    }

    // Step 6: Finalize audit
    const pageScores = scoredPages
      .map((p) => p.score)
      .filter((s): s is number => s != null);

    // Normalize to 0-100 scale (page scores are 0-10)
    const overallScore =
      pageScores.length > 0
        ? Math.round(
            (pageScores.reduce((sum, s) => sum + s, 0) / pageScores.length) * 10
          )
        : 0;

    await supabase
      .from("radar_audits")
      .update({
        status: "completed",
        pages_analyzed: scoredPages.length,
        overall_score: overallScore,
        completed_at: new Date().toISOString(),
      })
      .eq("id", audit.id);

    console.log(
      `[Radar Audit] Completed for user ${userId}: ${scoredPages.length} pages, score=${overallScore}`
    );

    return {
      success: true,
      auditId: audit.id,
      pagesAnalyzed: scoredPages.length,
      overallScore,
    };
  } catch (err) {
    await supabase
      .from("radar_audits")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", audit.id);

    throw err;
  }
}
