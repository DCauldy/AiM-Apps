import { generateText } from "ai";
import { getRadarGrokModel } from "@/lib/openrouter";
import type { AIEngine, EngineResponse } from "@/types/radar";
import type { EngineConnector } from "./index";

export class GrokConnector implements EngineConnector {
  engine: AIEngine = "grok";

  async query(queryText: string): Promise<EngineResponse> {
    try {
      const { text } = await generateText({
        model: getRadarGrokModel(),
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
        error: `Grok connector error: ${message}`,
      };
    }
  }
}
