import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://apps.aimarketingacademy.com";

const useOpenRouter = !!process.env.OPENROUTER_API_KEY;

// ---------------------------------------------------------------------------
// Provider factories
// ---------------------------------------------------------------------------

/**
 * OpenRouter provider (used in production when OPENROUTER_API_KEY is set).
 */
function createAppProvider(appName: string) {
  return createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "X-Title": `AiM ${appName}`,
      "HTTP-Referer": APP_URL,
    },
  });
}

// Lazy OpenRouter providers
let blogEngineProvider: ReturnType<typeof createOpenAI> | null = null;
let promptStudioProvider: ReturnType<typeof createOpenAI> | null = null;
let radarProvider: ReturnType<typeof createOpenAI> | null = null;

function getBlogEngineProvider() {
  if (!blogEngineProvider) blogEngineProvider = createAppProvider("Blog Engine");
  return blogEngineProvider;
}

function getPromptStudioProvider() {
  if (!promptStudioProvider) promptStudioProvider = createAppProvider("Prompt Studio");
  return promptStudioProvider;
}

function getRadarProvider() {
  if (!radarProvider) radarProvider = createAppProvider("Radar");
  return radarProvider;
}

// Lazy direct API providers (fallback when no OpenRouter key)
let directOpenAI: ReturnType<typeof createOpenAI> | null = null;
let directAnthropic: ReturnType<typeof createAnthropic> | null = null;
let directPerplexity: ReturnType<typeof createOpenAI> | null = null;

function getDirectOpenAI() {
  if (!directOpenAI) directOpenAI = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return directOpenAI;
}

function getDirectAnthropic() {
  if (!directAnthropic) directAnthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return directAnthropic;
}

function getDirectPerplexity() {
  if (!directPerplexity) directPerplexity = createOpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: "https://api.perplexity.ai",
  });
  return directPerplexity;
}

// ---------------------------------------------------------------------------
// Blog Engine models
// ---------------------------------------------------------------------------

/** Perplexity sonar-pro for deep web research / topic discovery. */
export function getResearchModel() {
  if (!useOpenRouter) return getDirectPerplexity().chat("sonar-pro");
  return getBlogEngineProvider().chat("perplexity/sonar-pro");
}

/** GPT-4o for BOFU scoring and structured analysis */
export function getScoringModel() {
  if (!useOpenRouter) return getDirectOpenAI().chat("gpt-4o");
  return getBlogEngineProvider().chat("openai/gpt-4o");
}

/** Claude Sonnet for high-quality blog writing */
export function getWritingModel() {
  if (!useOpenRouter) return getDirectAnthropic()("claude-sonnet-4-20250514");
  return getBlogEngineProvider()("anthropic/claude-sonnet-4");
}

/** GPT Image 2 for featured image generation */
export function getImageModel() {
  if (!useOpenRouter) return getDirectOpenAI().image("gpt-image-1");
  return getBlogEngineProvider().image("openai/gpt-5.4-image-2");
}

/** Embedding model for topic deduplication */
export function getEmbeddingModel() {
  if (!useOpenRouter) return getDirectOpenAI().embedding("text-embedding-3-small");
  return getBlogEngineProvider().embedding("openai/text-embedding-3-small");
}

// ---------------------------------------------------------------------------
// Blog Engine onboarding — uses Claude for conversational intake
// ---------------------------------------------------------------------------

export function getOnboardingModel() {
  if (!useOpenRouter) return getDirectAnthropic()("claude-sonnet-4-20250514");
  return getBlogEngineProvider().chat("anthropic/claude-sonnet-4");
}

// ---------------------------------------------------------------------------
// Blog Engine refinement chat — uses Claude for blog editing
// ---------------------------------------------------------------------------

export function getRefinementModel() {
  if (!useOpenRouter) return getDirectAnthropic()("claude-sonnet-4-20250514");
  return getBlogEngineProvider().chat("anthropic/claude-sonnet-4");
}

// ---------------------------------------------------------------------------
// Prompt Studio model (backward-compatible migration from direct OpenAI)
// ---------------------------------------------------------------------------

export function getPromptStudioModel() {
  if (!useOpenRouter) {
    const modelId = process.env.OPENAI_MODEL || "gpt-4o";
    return getDirectOpenAI().chat(modelId);
  }
  const modelId = process.env.OPENAI_MODEL || "openai/gpt-4o";
  const fullModelId = modelId.includes("/") ? modelId : `openai/${modelId}`;
  return getPromptStudioProvider().chat(fullModelId);
}

// ---------------------------------------------------------------------------
// Radar models
// ---------------------------------------------------------------------------

/** Model for analyzing engine responses (extract brand mentions, sentiment, etc.) */
export function getRadarAnalyzerModel() {
  if (!useOpenRouter) return getDirectOpenAI().chat("gpt-4o");
  return getRadarProvider().chat("openai/gpt-4o");
}

/** Model for audit page scoring */
export function getRadarAuditModel() {
  if (!useOpenRouter) return getDirectOpenAI().chat("gpt-4o");
  return getRadarProvider().chat("openai/gpt-4o");
}

/** Model for query discovery */
export function getRadarQueryDiscoveryModel() {
  if (!useOpenRouter) return getDirectOpenAI().chat("gpt-4o");
  return getRadarProvider().chat("openai/gpt-4o");
}

// Radar engine connector models — each returns the model used to simulate that AI engine

export function getRadarChatGPTModel() {
  if (!useOpenRouter) return getDirectOpenAI().chat("gpt-4o");
  return getRadarProvider().chat("openai/gpt-4o");
}

export function getRadarPerplexityModel() {
  if (!useOpenRouter) return getDirectPerplexity().chat("sonar-pro");
  return getRadarProvider().chat("perplexity/sonar-pro");
}

export function getRadarGeminiModel() {
  if (!useOpenRouter) return getDirectOpenAI().chat("gpt-4o"); // fallback
  return getRadarProvider().chat("google/gemini-2.5-flash");
}

export function getRadarClaudeModel() {
  if (!useOpenRouter) return getDirectAnthropic()("claude-sonnet-4-20250514");
  return getRadarProvider().chat("anthropic/claude-sonnet-4");
}

export function getRadarGrokModel() {
  if (!useOpenRouter) return getDirectOpenAI().chat("gpt-4o"); // fallback
  return getRadarProvider().chat("x-ai/grok-3");
}
