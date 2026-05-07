import type { AIEngine, EngineResponse } from "@/types/radar";
import type { EngineConnector } from "./index";

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const BROWSERLESS_API_URL =
  process.env.BROWSERLESS_API_URL || "https://chrome.browserless.io";

/**
 * Google AI Mode connector.
 *
 * Uses Browserless.io to scrape Google AI Mode responses.
 * AI Mode is Google's conversational AI search experience.
 */
export class GoogleAIModeConnector implements EngineConnector {
  engine: AIEngine = "google_ai_mode";

  async query(queryText: string): Promise<EngineResponse> {
    try {
      // Google AI Mode URL pattern
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(queryText)}&udm=50`;

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
      const responseText = this.extractAIModeResponse(html);

      if (!responseText) {
        return {
          engine: this.engine,
          query: queryText,
          responseText: "",
          error: "No AI Mode response found for this query",
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
        error: `Google AI Mode connector error: ${message}`,
      };
    }
  }

  /**
   * Extract AI Mode response content from Google search HTML.
   */
  private extractAIModeResponse(html: string): string {
    // AI Mode renders conversational responses in specific containers.
    // The structure changes frequently, so we try multiple approaches.

    const aiModePatterns = [
      // AI Mode conversation container
      /<div[^>]*class="[^"]*(?:XbIQze|BbMJje|RDmXvc)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
      // Alternative container patterns
      /<div[^>]*data-content-feature="1"[^>]*>([\s\S]*?)<\/div>/i,
      // General AI response block
      /<div[^>]*class="[^"]*(?:LGOjhe|Ww4FFb)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const pattern of aiModePatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const text = match[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (text.length > 50) {
          return text;
        }
      }
    }

    // Broader fallback: extract the main content area text
    const mainContent = html.match(
      /<div[^>]*id="(?:center_col|main)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i
    );
    if (mainContent?.[1]) {
      const text = mainContent[1]
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (text.length > 100) {
        // Return first 5000 chars to avoid excessively long responses
        return text.slice(0, 5000);
      }
    }

    return "";
  }
}
