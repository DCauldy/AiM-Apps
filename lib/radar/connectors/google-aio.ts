import type { AIEngine, EngineResponse } from "@/types/radar";
import type { EngineConnector } from "./index";

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const BROWSERLESS_API_URL =
  process.env.BROWSERLESS_API_URL || "https://chrome.browserless.io";

/**
 * Google AI Overviews connector.
 *
 * Uses Browserless.io to scrape Google search results and extract
 * the AI Overview (SGE) snippet that appears at the top of some queries.
 */
export class GoogleAIOConnector implements EngineConnector {
  engine: AIEngine = "google_aio";

  async query(queryText: string): Promise<EngineResponse> {
    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(queryText)}`;

      const response = await fetch(
        `${BROWSERLESS_API_URL}/content?token=${BROWSERLESS_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: searchUrl,
            waitForSelector: "body",
            gotoOptions: { waitUntil: "networkidle2" },
          }),
        }
      );

      if (!response.ok) {
        return {
          engine: this.engine,
          query: queryText,
          responseText: "",
          error: `Browserless returned ${response.status}`,
        };
      }

      const html = await response.text();
      const responseText = this.extractAIOverview(html);

      if (!responseText) {
        return {
          engine: this.engine,
          query: queryText,
          responseText: "",
          error: "No AI Overview found for this query",
        };
      }

      return {
        engine: this.engine,
        query: queryText,
        responseText,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return {
        engine: this.engine,
        query: queryText,
        responseText: "",
        error: `Google AIO connector error: ${message}`,
      };
    }
  }

  /**
   * Extract AI Overview content from Google search results HTML.
   * Google wraps AI Overviews in specific container elements.
   */
  private extractAIOverview(html: string): string {
    // Google AI Overview is typically in a div with data-attrid="wa:/m/..." or
    // within specific container classes. The structure changes frequently, so
    // we try multiple selectors.

    // Pattern 1: AI Overview container (data-md attribute)
    const aiOverviewPatterns = [
      // AI Overview block via data-attrid
      /<div[^>]*class="[^"]*(?:kp-blk|ai-overview|Wt5Tfe)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i,
      // SGE response container
      /<div[^>]*data-attrid="wa:\/[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      // Alternative: look for the AI-generated response section
      /<div[^>]*class="[^"]*(?:yDYNvb|LGOjhe|MjjYud)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const pattern of aiOverviewPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        // Strip HTML tags to get text content
        const text = match[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Only return if we got meaningful content (not just nav elements)
        if (text.length > 50) {
          return text;
        }
      }
    }

    // Fallback: try to get the featured snippet if no AI overview
    const featuredSnippetMatch = html.match(
      /<div[^>]*class="[^"]*(?:hgKElc|V3FYCf)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    if (featuredSnippetMatch?.[1]) {
      const text = featuredSnippetMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 30) return text;
    }

    return "";
  }
}
