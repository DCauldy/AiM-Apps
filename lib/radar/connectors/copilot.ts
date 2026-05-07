import type { AIEngine, EngineResponse } from "@/types/radar";
import type { EngineConnector } from "./index";

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const BROWSERLESS_API_URL =
  process.env.BROWSERLESS_API_URL || "https://chrome.browserless.io";

/**
 * Microsoft Copilot connector.
 *
 * Uses Browserless.io to scrape Copilot (Bing AI) responses.
 */
export class CopilotConnector implements EngineConnector {
  engine: AIEngine = "copilot";

  async query(queryText: string): Promise<EngineResponse> {
    try {
      // Bing search with Copilot enabled
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(queryText)}&showconv=1`;

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
      const responseText = this.extractCopilotResponse(html);

      if (!responseText) {
        return {
          engine: this.engine,
          query: queryText,
          responseText: "",
          error: "No Copilot response found for this query",
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
        error: `Copilot connector error: ${message}`,
      };
    }
  }

  /**
   * Extract Copilot/Bing AI response from search results HTML.
   */
  private extractCopilotResponse(html: string): string {
    // Bing Copilot responses appear in specific container elements
    const copilotPatterns = [
      // Copilot chat panel
      /<div[^>]*class="[^"]*(?:b_copilotAnswer|cib-serp-main)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
      // Bing AI-generated answer
      /<div[^>]*class="[^"]*(?:rai_ans|b_aiAns)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      // Bing chat response container
      /<div[^>]*id="b_results"[^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const pattern of copilotPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const text = match[1]
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (text.length > 50) {
          // Return first 5000 chars
          return text.slice(0, 5000);
        }
      }
    }

    return "";
  }
}
