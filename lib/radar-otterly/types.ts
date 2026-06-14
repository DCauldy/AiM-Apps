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
// Audits
// ---------------------------------------------------------------------------

export interface OtterlyAuditCheck {
  id: string;
  workspaceId: string;
  url: string;
  status: "pending" | "running" | "finished" | "failed";
  createdDate: string;
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
