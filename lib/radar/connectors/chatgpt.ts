import { generateText } from "ai";
import { getRadarChatGPTModel } from "@/lib/openrouter";
import type { AIEngine, EngineResponse } from "@/types/radar";
import type { EngineConnector } from "./index";

export class ChatGPTConnector implements EngineConnector {
  engine: AIEngine = "chatgpt";

  async query(queryText: string): Promise<EngineResponse> {
    try {
      const { text } = await generateText({
        model: getRadarChatGPTModel(),
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
        error: `ChatGPT connector error: ${message}`,
      };
    }
  }
}
