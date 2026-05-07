// ---------------------------------------------------------------------------
// AI Engine enum
// ---------------------------------------------------------------------------

export type AIEngine =
  | "chatgpt"
  | "perplexity"
  | "gemini"
  | "google_aio"
  | "google_ai_mode"
  | "copilot"
  | "claude"
  | "grok";

export const AI_ENGINES: AIEngine[] = [
  "chatgpt",
  "perplexity",
  "gemini",
  "google_aio",
  "google_ai_mode",
  "copilot",
  "claude",
  "grok",
];

export const AI_ENGINE_LABELS: Record<AIEngine, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  google_aio: "Google AI Overviews",
  google_ai_mode: "Google AI Mode",
  copilot: "Copilot",
  claude: "Claude",
  grok: "Grok",
};

// ---------------------------------------------------------------------------
// Radar Config
// ---------------------------------------------------------------------------

export interface RadarConfig {
  id: string;
  user_id: string;
  brand_variations: string[];
  monitored_engines: AIEngine[];
  monitoring_frequency: "monthly" | "weekly";
  tier: "pro" | "silver" | "gold" | "platinum";
  query_limit: number;
  manual_checks_limit: number;
  audits_limit: number;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  onboarding_completed: boolean;
  last_check_at?: string;
  next_check_at?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

export interface RadarCompetitor {
  id: string;
  user_id: string;
  name: string;
  website_url?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type QuerySource = "ai_generated" | "manual" | "competitor_discovery";

export interface RadarQuery {
  id: string;
  user_id: string;
  query_text: string;
  category?: string;
  source: QuerySource;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Query Suggestions
// ---------------------------------------------------------------------------

export type SuggestionStatus = "suggested" | "added" | "dismissed";

export interface RadarQuerySuggestion {
  id: string;
  user_id: string;
  query_text: string;
  category?: string;
  status: SuggestionStatus;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Checks (monitoring runs)
// ---------------------------------------------------------------------------

export type CheckTrigger = "scheduled" | "manual";
export type CheckStatus = "pending" | "running" | "completed" | "completed_partial" | "failed";

export interface RadarCheck {
  id: string;
  user_id: string;
  trigger: CheckTrigger;
  status: CheckStatus;
  engines_checked: AIEngine[];
  engines_failed: AIEngine[];
  queries_checked: number;
  visibility_score?: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Results (per query per engine per check)
// ---------------------------------------------------------------------------

export type Sentiment = "positive" | "neutral" | "negative";

export interface RadarResult {
  id: string;
  check_id: string;
  user_id: string;
  query_id: string;
  engine: AIEngine;
  brand_mentioned: boolean;
  position?: number;
  sentiment?: Sentiment;
  competitors_mentioned: string[];
  citations: string[];
  response_text?: string;
  quality_score: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AlertType =
  | "brand_appeared"
  | "brand_disappeared"
  | "position_improved"
  | "position_declined"
  | "new_competitor"
  | "competitor_overtook"
  | "citation_gained"
  | "citation_lost"
  | "audit_score_changed";

export type AlertSeverity = "positive" | "negative" | "info";

export interface RadarAlert {
  id: string;
  user_id: string;
  check_id?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Audits
// ---------------------------------------------------------------------------

export type AuditStatus = "pending" | "crawling" | "analyzing" | "completed" | "failed";

export interface RadarAudit {
  id: string;
  user_id: string;
  url_crawled: string;
  status: AuditStatus;
  pages_found: number;
  pages_analyzed: number;
  overall_score?: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Audit Pages
// ---------------------------------------------------------------------------

export type PageType = "homepage" | "service" | "about" | "neighborhood" | "blog" | "listing" | "other";

export interface ScoringBreakdown {
  structured_data: number;
  content_depth: number;
  authority_signals: number;
  crawlability: number;
  citation_potential: number;
  internal_linking: number;
}

export interface AuditRecommendation {
  signal: keyof ScoringBreakdown;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export interface RadarAuditPage {
  id: string;
  audit_id: string;
  user_id: string;
  url: string;
  page_type: PageType;
  title?: string;
  score?: number;
  scoring_breakdown: ScoringBreakdown;
  recommendations: AuditRecommendation[];
  is_blog: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface RadarUsage {
  user_id: string;
  period: string;
  manual_checks_used: number;
  audits_used: number;
}

export interface RadarUsageStatus {
  queriesUsed: number;
  queryLimit: number;
  manualChecksUsed: number;
  manualChecksLimit: number;
  auditsUsed: number;
  auditsLimit: number;
  period: string;
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

export interface RadarPack {
  id: string;
  tier: string;
  queryLimit: number;
  manualChecksLimit: number;
  auditsLimit: number;
  monitoringFrequency: "monthly" | "weekly";
  priceCents: number;
  stripePriceId: string;
  label: string;
  bestValue?: boolean;
}

// ---------------------------------------------------------------------------
// Engine Connector interface
// ---------------------------------------------------------------------------

export interface EngineResponse {
  engine: AIEngine;
  query: string;
  responseText: string;
  error?: string;
}

export interface AnalyzedResult {
  brand_mentioned: boolean;
  position?: number;
  sentiment?: Sentiment;
  competitors_mentioned: string[];
  citations: string[];
  quality_score: number;
}

// ---------------------------------------------------------------------------
// Crawler types
// ---------------------------------------------------------------------------

export interface CrawledPage {
  url: string;
  html: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Engine weight tiers
// ---------------------------------------------------------------------------

export type EngineWeights = Record<AIEngine, number>;
