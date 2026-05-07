import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { crawlWebsite } from "@/lib/radar/crawler";
import {
  extractPageSignals,
  classifyPageType,
  scorePages,
} from "@/lib/radar/audit-analyzer";
import type { BofuProfile } from "@/types/blog-engine";
import type { CrawledPage, ScoringBreakdown, PageType, AuditRecommendation } from "@/types/radar";

// ---------------------------------------------------------------------------
// Event type
// ---------------------------------------------------------------------------

type RadarAuditEvent = {
  name: "radar/audit.requested";
  data: {
    userId: string;
    url: string;
  };
};

// ---------------------------------------------------------------------------
// Radar Audit — Inngest function
// ---------------------------------------------------------------------------

export const radarAudit = inngest.createFunction(
  {
    id: "radar-audit",
    name: "Radar Website Audit",
    retries: 1,
    concurrency: [{ limit: 2 }],
    triggers: [{ event: "radar/audit.requested" }],
  },
  async ({ event, step }: { event: { data: RadarAuditEvent["data"]; id?: string }; step: any }) => {
    const { userId, url } = event.data;
    const supabase = createServiceRoleClient();

    // -----------------------------------------------------------------------
    // Step 1: Create audit record
    // -----------------------------------------------------------------------
    const audit = await step.run("create-audit", async () => {
      const { data, error } = await supabase
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

      if (error || !data) {
        throw new Error(`Failed to create audit: ${error?.message}`);
      }
      return data;
    });

    // -----------------------------------------------------------------------
    // Step 2: Crawl website
    // -----------------------------------------------------------------------
    const crawledPages = await step.run("crawl", async () => {
      const pages = await crawlWebsite(url, 50);

      // Update audit with pages_found
      await supabase
        .from("radar_audits")
        .update({
          status: "analyzing",
          pages_found: pages.length,
        })
        .eq("id", audit.id);

      return pages;
    });

    if (crawledPages.length === 0) {
      await step.run("finalize-no-pages", async () => {
        await supabase
          .from("radar_audits")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", audit.id);
      });

      return { success: false, auditId: audit.id, reason: "no_pages_crawled" };
    }

    // -----------------------------------------------------------------------
    // Step 3: Extract signals from each page
    // -----------------------------------------------------------------------
    const pagesWithSignals: Array<{
      url: string;
      html: string;
      title: string;
      signals: Partial<ScoringBreakdown>;
      pageType: PageType;
    }> = await step.run("extract-signals", async () => {
      return (crawledPages as CrawledPage[]).map((page: CrawledPage) => {
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
    });

    // -----------------------------------------------------------------------
    // Step 4: Score pages with LLM
    // -----------------------------------------------------------------------
    const scoredPages: Array<{
      url: string;
      page_type: PageType;
      score: number;
      scoring_breakdown: ScoringBreakdown;
      recommendations: AuditRecommendation[];
    }> = await step.run("score-pages", async () => {
      // Load user profile for context
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!profile) {
        // Fallback: use rule-based scores only
        return pagesWithSignals.map((p) => {
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
      }

      return scorePages(
        pagesWithSignals.map((p) => ({
          url: p.url,
          html: p.html,
          title: p.title,
          signals: p.signals,
        })),
        profile as BofuProfile
      );
    });

    // -----------------------------------------------------------------------
    // Step 5: Save audit pages
    // -----------------------------------------------------------------------
    await step.run("save-pages", async () => {
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

      // Insert in batches of 50 to avoid payload limits
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase.from("radar_audit_pages").insert(batch);
        if (error) {
          console.error(`[Radar Audit] Failed to save pages batch ${i}:`, error);
        }
      }

      return { saved: rows.length };
    });

    // -----------------------------------------------------------------------
    // Step 6: Finalize audit
    // -----------------------------------------------------------------------
    const overallScore = await step.run("finalize", async () => {
      // Compute overall score as average of page scores
      const pageScores = scoredPages
        .map((p) => p.score)
        .filter((s): s is number => s != null);

      // Normalize to 0-100 scale (page scores are 0-10)
      const avgScore =
        pageScores.length > 0
          ? Math.round(
              (pageScores.reduce((sum, s) => sum + s, 0) / pageScores.length) *
                10
            )
          : 0;

      await supabase
        .from("radar_audits")
        .update({
          status: "completed",
          pages_analyzed: scoredPages.length,
          overall_score: avgScore,
          completed_at: new Date().toISOString(),
        })
        .eq("id", audit.id);

      console.log(
        `[Radar Audit] Completed for user ${userId}: ${scoredPages.length} pages, score=${avgScore}`
      );

      return avgScore;
    });

    return {
      success: true,
      auditId: audit.id,
      pagesAnalyzed: scoredPages.length,
      overallScore,
    };
  }
);
