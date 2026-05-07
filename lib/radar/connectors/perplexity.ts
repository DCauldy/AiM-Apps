import { generateText } from "ai";
import { getRadarPerplexityModel } from "@/lib/openrouter";
import type { AIEngine, EngineResponse } from "@/types/radar";
import type { EngineConnector } from "./index";

export class PerplexityConnector implements EngineConnector {
  engine: AIEngine = "perplexity";

  async query(queryText: string): Promise<EngineResponse> {
    try {
      const { text } = await generateText({
        model: getRadarPerplexityModel(),
        prompt: queryText,
      });

      return {
        engine: this.engine,
        query: queryText,
        responseText: text,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return {
        engine: this.engine,
        query: queryText,
        responseText: "",
        error: `Perplexity connector error: ${message}`,
      };
    }
  }
}
