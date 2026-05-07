import type { AIEngine, EngineResponse } from "@/types/radar";

// ---------------------------------------------------------------------------
// Engine Connector interface
// ---------------------------------------------------------------------------

export interface EngineConnector {
  engine: AIEngine;
  query(queryText: string): Promise<EngineResponse>;
}

// ---------------------------------------------------------------------------
// Connector imports (lazy)
// ---------------------------------------------------------------------------

import { ChatGPTConnector } from "./chatgpt";
import { PerplexityConnector } from "./perplexity";
import { GeminiConnector } from "./gemini";
import { ClaudeConnector } from "./claude";
import { GrokConnector } from "./grok";
import { GoogleAIOConnector } from "./google-aio";
import { GoogleAIModeConnector } from "./google-ai-mode";
import { CopilotConnector } from "./copilot";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Get the appropriate connector for a given AI engine.
 */
export function getConnector(engine: AIEngine): EngineConnector {
  switch (engine) {
    case "chatgpt":
      return new ChatGPTConnector();
    case "perplexity":
      return new PerplexityConnector();
    case "gemini":
      return new GeminiConnector();
    case "claude":
      return new ClaudeConnector();
    case "grok":
      return new GrokConnector();
    case "google_aio":
      return new GoogleAIOConnector();
    case "google_ai_mode":
      return new GoogleAIModeConnector();
    case "copilot":
      return new CopilotConnector();
    default:
      throw new Error(`Unknown AI engine: ${engine}`);
  }
}
