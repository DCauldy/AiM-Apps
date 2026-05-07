import { generateText } from "ai";
import { getRadarClaudeModel } from "@/lib/openrouter";
import type { AIEngine, EngineResponse } from "@/types/radar";
import type { EngineConnector } from "./index";

export class ClaudeConnector implements EngineConnector {
  engine: AIEngine = "claude";

  async query(queryText: string): Promise<EngineResponse> {
    try {
      const { text } = await generateText({
        model: getRadarClaudeModel(),
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
        error: `Claude connector error: ${message}`,
      };
    }
  }
}
