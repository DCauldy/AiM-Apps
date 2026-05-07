import { generateText } from "ai";
import { getRadarGeminiModel } from "@/lib/openrouter";
import type { AIEngine, EngineResponse } from "@/types/radar";
import type { EngineConnector } from "./index";

export class GeminiConnector implements EngineConnector {
  engine: AIEngine = "gemini";

  async query(queryText: string): Promise<EngineResponse> {
    try {
      const { text } = await generateText({
        model: getRadarGeminiModel(),
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
        error: `Gemini connector error: ${message}`,
      };
    }
  }
}
