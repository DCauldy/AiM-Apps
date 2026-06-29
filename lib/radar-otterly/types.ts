// ============================================================
// Otterly API response types — hand-built from the endpoint docs
// at https://docs.otterly.ai/api-reference/* and validated against
// real responses captured from the probe sandbox.
//
// Only includes the fields we surface in the dashboard. Otterly
// returns more on most endpoints; if we need it later, add it here.
// ============================================================

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface OtterlyAccountInfo {
  subscriptionPlan: "trial" | "lite" | "standard" | "premium" | "custom" | null;
  subscriptionEndDate: string | null;
  promptsUsedCount: number;
  promptsMaxCount: number;
  geoAuditUsedCount: number;
  geoAuditMaxCount: number;
  apiRequestsUsedCount: number;
  apiRequestsMaxCount: number;
  apiRequestsPeriodEnd: string | null;
  mcpRequestsUsedCount: number;
  mcpRequestsMaxCount: number | null;
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export interface OtterlyWorkspace {
  id: string;
  name: string;
  promptsUsedCount: number;
  promptsMaxCount: number;
  geoAuditUsedCount: number;
  geoAuditMaxCount: number;
  createdDate: string;
  updatedDate: string;
}

export interface OtterlyPaging {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface OtterlyListResponse<T> {
  items: T[];
  paging: OtterlyPaging;
}

// ---------------------------------------------------------------------------
// Brand reports
// ---------------------------------------------------------------------------

export interface OtterlyBrandCompetitor {
  brand: string;
  brandVariations: string[];
  brandDomain: string;
  brandDomainVariations: string[];
  brandDomainWildcard: boolean;
}

export interface OtterlyBrandReport {
  id: string;
  workspaceId: string;
  brand: string;
  brandDomain: string;
  brandVariations: string[];
  brandDomainVariations: string[];
  brandDomainWildcard: boolean;
  countries: string[];
  competitors: OtterlyBrandCompetitor[];
  reportTitle?: string;
  createdDate: string;
  updatedDate: string;
}

// ---------------------------------------------------------------------------
// Stats — the meat. Drives the KPI strip + competitor table + time-series.
// ---------------------------------------------------------------------------

export interface OtterlyStatsSummary {
  averageRank: number | null;
  averagePosition: number | null;
  totalMentions: number;
  totalSources: number;
  shareOfVoice: number;
  brandCoverage: number;
  domainCoverage: number;
}

export interface OtterlyDetectedBrand {
  name: string;
  mentions: number;
}

export interface OtterlySentiment {
  positive: number;
  neutral: number;
  negative: number;
  /** Net Sentiment Score (positive - negative scaled). */
  nss: number;
}

export interface OtterlyCompetitorBrandMention {
  brand: string;
  domain: string;
  logoUrl: string;
  isMainBrand: boolean;
  mentions: number;
  shareOfVoice: number;
  brandCoverage: number;
  domainCoverage: number;
  domainCitations: number;
  averageRank: number | null;
  averagePosition: number | null;
  visibilityScore: number;
  likelihoodToBuy: number | null;
  sentiment: OtterlySentiment | null;
}

export interface OtterlyBrandHistoryPoint {
  date: string;
  brands: Array<{
    brand: string;
    isMainBrand: boolean;
    logoUrl?: string;
    coverage?: number;
    position?: number;
    rank?: number;
    visibilityScore?: number;
    brandCoverage?: number;
    likelihoodToBuy?: number;
  }>;
}

export interface OtterlyDomainHistoryPoint {
  date: string;
  domains: Array<{
    domain: string;
    isMainBrand: boolean;
    logoUrl?: string;
    coverage: number;
  }>;
}

export interface OtterlyBrandReportStats {
  id: string;
  status: "finished" | "pending" | "failed";
  isRecalculating: boolean;
  totalPrompts: number;
  brand: {
    brand: string;
    brandDomain: string;
  };
  summary: OtterlyStatsSummary;
  detectedBrands: OtterlyDetectedBrand[];
  allBrandsAnalysis: {
    brandMentions: Array<{
      brand: string;
      isMainBrand: boolean;
      rank: number;
      mentions: number;
      shareOfVoice: number;
      brandCoverage: number;
    }>;
    brandRankHistory: OtterlyBrandHistoryPoint[];
    brandCoverageHistory: OtterlyBrandHistoryPoint[];
    brandPositionHistory: OtterlyBrandHistoryPoint[];
    brandVisibilityIndex: OtterlyBrandHistoryPoint[];
    domainCoverageHistory: OtterlyDomainHistoryPoint[];
  };
  competitorBrandsAnalysis: {
    brandMentions: OtterlyCompetitorBrandMention[];
    brandCoverageHistory: OtterlyBrandHistoryPoint[];
    domainCoverageHistory: OtterlyDomainHistoryPoint[];
    brandVisibilityIndex: OtterlyBrandHistoryPoint[];
  };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

// Actionable cards Otterly generates for the report (e.g. "you only
// have 1 competitor configured, add more"). Shape captured from the
// real /recommendations response. `data` is type-discriminated by
// `type` but we keep it loose for now — surface in a generic
// "suggested actions" widget; deep-link to Otterly's UI for the fix.
export interface OtterlyRecommendation {
  id: string;
  type: string; // e.g. "competitors_count"
  group: string; // e.g. "general"
  priority: number;
  state: "suggested" | "dismissed" | "completed";
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Research — per-prompt drill-down. Verbatim AI responses are NOT
// available on the public API (the /responses endpoint 404s). What
// we do get: rich per-prompt aggregates + citations.
// ---------------------------------------------------------------------------

export interface OtterlyPromptSummary {
  id: string;
  rank: number;
  country: string;
  prompt: string;
  /** Intent volume (estimated monthly searches). May be 0 if Otterly
   *  doesn't have keyword data for the phrasing. */
  volume: number;
  /** Times the main brand was mentioned across all engine runs of
   *  this prompt in the window. */
  brandMentions: number;
  /** Times the main brand's domain was cited across all engine runs
   *  of this prompt in the window. */
  domainMentions: number;
  tags: string[];
  /** Competitor brand mention counts on this specific prompt. Shape:
   *  Array<{ brand, mentions }> but we keep it loose for now. */
  competitors: unknown[];
}

export interface OtterlyPromptBrandRow {
  brand: string;
  rank: number;
  mentions: number;
  brandCoverage: number;
  sentiment: OtterlySentiment | null;
}

export interface OtterlyDomainCategoryRow {
  category: string;
  value: number;
}

export interface OtterlyPromptDetail {
  id: string;
  reportId: string;
  prompt: string;
  intentVolume: number;
  brandCoverageHistory: Array<{ brand: string; coverage: number; date: string }>;
  brandRank: OtterlyPromptBrandRow[];
  domainCategories: OtterlyDomainCategoryRow[];
  brandReports: Array<{
    id: string;
    brand: string;
    brandDomain: string;
    reportTitle?: string;
  }>;
  tags: string[];
}

export interface OtterlyCitation {
  url: string;
  domain: string;
  title: string;
  /** Total times AI engines cited this URL across all prompts in the
   *  window (across the brand report). */
  citations: number;
  /** Prompt IDs that cited this URL. Populated by the citations
   *  endpoint. */
  prompts: string[];
  competitors: unknown[];
  /** 1 if the main brand was mentioned in the response that cited
   *  this URL, 0 otherwise. */
  brandMentioned: number;
  /** "Brand" (your domain), "Others", "Blogs/Personal Sites", etc. */
  domainCategory: string;
}

// ---------------------------------------------------------------------------
// Audits
// ---------------------------------------------------------------------------

export interface OtterlyAuditCheck {
  id: string;
  workspaceId: string;
  url: string;
  // Otterly uses both "finished" (in older payloads) and "completed"
  // (newer detail responses). Treat them as the same terminal state.
  status: "pending" | "running" | "finished" | "completed" | "failed";
  createdDate: string;
}

// ---------------------------------------------------------------------------
// Content-check detail — Otterly's full GEO-readiness audit of a single
// URL. Returned by GET /v1/audits/geo/content-checks/{id} once the
// background audit finishes.
// ---------------------------------------------------------------------------

export interface OtterlyAuditCategoryBreakdown {
  [key: string]: {
    maxScore: number;
    score: number;
  };
}

export interface OtterlyAuditCategory {
  score: number;
  breakdown: OtterlyAuditCategoryBreakdown;
}

export interface OtterlyContentCheckDetail extends OtterlyAuditCheck {
  structuralAnalysis?: {
    overallScore: number;
    categoryScores: {
      metadata: number;
      technical: number;
      structure: number;
      content: number;
    };
    metadata: OtterlyAuditCategory;
    technical: OtterlyAuditCategory;
    structure: OtterlyAuditCategory;
    content: OtterlyAuditCategory;
  };
  dynamicContent?: {
    score: number;
    differenceDescription: string;
    dynamicLength: number;
    staticLength: number;
    isPotentiallyBlocked: boolean;
  };
}

export interface OtterlyCrawlabilityCheckDetail extends OtterlyAuditCheck {
  // Shape verified once we run one — kept loose for now since we
  // don't yet have a finished crawlability check in this account.
  results?: Record<string, unknown>;
}

export interface CreateAuditCheckInput {
  workspaceId: string;
  url: string;
  /** Content check only. */
  crawlerIdentity?:
    | "ChatGPT-User"
    | "OAI-SearchBot"
    | "PerplexityCrawler"
    | "GoogleBot";
  /** Content check only. */
  sendOtterlyHeader?: boolean;
}
