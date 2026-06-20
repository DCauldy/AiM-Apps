import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouterAiSdkProvider } from "./openrouter/ai-sdk";
import { OPENROUTER_REFERER } from "./openrouter/apps";

export * from "./openrouter/index";

// HTTP-Referer sent to OpenRouter for attribution. Always the public prod URL
// — not NEXT_PUBLIC_APP_URL — so dev/preview/prod all aggregate under a single
// app entry instead of fragmenting per environment ("http://localhost:6060/",
// "https://aim-apps-git-abc.vercel.app/", etc).
const useOpenRouter = !!process.env.OPENROUTER_API_KEY;

// ---------------------------------------------------------------------------
// Provider factories
// ---------------------------------------------------------------------------

/**
 * OpenRouter provider (used in production when OPENROUTER_API_KEY is set).
 *
 * Attribution: OpenRouter identifies apps by HTTP-Referer (primary) +
 * X-OpenRouter-Title (display name) — no manual registration. Apps show
 * up at openrouter.ai/apps?url=<APP_URL> once they've received traffic
 * with both headers.
 *
 * Header injection happens via a custom `fetch` wrapper rather than the
 * `headers` option on createOpenAI — observed in the wild that the
 * AI SDK's option doesn't always propagate to every outgoing request,
 * which leaves OpenRouter logs showing the bare referer URL instead of
 * the friendly title. A fetch interceptor is the belt-and-suspenders fix.
 */
function createAppProvider(appName: string) {
  return createOpenRouterAiSdkProvider({
    apiKey: process.env.OPENROUTER_API_KEY,
    app: {
      title: `AiM ${appName}`,
      referer: OPENROUTER_REFERER,
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
// Hyperlocal — email composition
// ---------------------------------------------------------------------------

let hyperlocalProvider: ReturnType<typeof createOpenAI> | null = null;
function getHyperlocalProvider() {
  if (!hyperlocalProvider) hyperlocalProvider = createAppProvider("Hyperlocal");
  return hyperlocalProvider;
}

/** Claude Sonnet for hyperlocal market-report email body writing */
export function getHyperlocalEmailWriterModel() {
  if (!useOpenRouter) return getDirectAnthropic()("claude-sonnet-4-20250514");
  return getHyperlocalProvider()("anthropic/claude-sonnet-4");
}

/** GPT-4o for crisp subject lines + preheaders */
export function getHyperlocalSubjectModel() {
  if (!useOpenRouter) return getDirectOpenAI().chat("gpt-4o");
  return getHyperlocalProvider().chat("openai/gpt-4o");
}

/**
 * GPT-4o-mini for conversational onboarding intake — used over Claude here
 * because `generateObject` schema extraction relies on OpenAI-style tool
 * calls, which round-trip cleanly through OpenRouter to OpenAI but flake
 * when OpenRouter has to translate between OpenAI tools and Anthropic
 * messages (silent "could not parse the response" failures). Email body
 * writing (getHyperlocalEmailWriterModel) stays on Claude where prose
 * quality matters more than structured output.
 */
export function getHyperlocalOnboardingModel() {
  if (!useOpenRouter) return getDirectOpenAI().chat("gpt-4o-mini");
  return getHyperlocalProvider().chat("openai/gpt-4o-mini");
}

// ---------------------------------------------------------------------------
// Listing Studio — vision (photo ordering + captioning)
// ---------------------------------------------------------------------------

let listingStudioProvider: ReturnType<typeof createOpenAI> | null = null;
function getListingStudioProvider() {
  if (!listingStudioProvider) listingStudioProvider = createAppProvider("Listing Studio");
  return listingStudioProvider;
}

/**
 * Claude Sonnet (vision-capable) for photo ordering + caption generation.
 * Accepts mixed text + image content parts in the messages array.
 */
export function getListingStudioVisionModel() {
  if (!useOpenRouter) return getDirectAnthropic()("claude-sonnet-4-20250514");
  return getListingStudioProvider()("anthropic/claude-sonnet-4");
}

/** Claude Sonnet for CMA seller narrative + internal memo + description prose. */
export function getListingStudioWriterModel() {
  if (!useOpenRouter) return getDirectAnthropic()("claude-sonnet-4-20250514");
  return getListingStudioProvider()("anthropic/claude-sonnet-4");
}

/** Haiku-class for cheap, fast post-generation compliance checks. */
export function getListingStudioComplianceModel() {
  if (!useOpenRouter) return getDirectAnthropic()("claude-haiku-4-20250514");
  return getListingStudioProvider()("anthropic/claude-haiku-4");
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

// Listing Studio writer + compliance models live with the vision helper
// above (single provider singleton).
