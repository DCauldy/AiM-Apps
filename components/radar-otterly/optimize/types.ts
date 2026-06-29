import type {
  OtterlyAuditCheck,
  OtterlyBrandReport,
  OtterlyContentCheckDetail,
} from "@/lib/radar-otterly/types";

// Shared types for the Optimize tab files. The OptimizeClient shell
// fetches /api/apps/radar/optimize once and routes chunks of the
// response to each section component.

export interface PromptInsight {
  id: string;
  rank: number;
  prompt: string;
  brandMentions: number;
  brandRank: number | null;
  intentVolume: number;
  topCompetitor: string | null;
  topCompetitorRank: number | null;
}

export type OptimizeStatus =
  | "ready"
  | "no_active_profile"
  | "no_website_url"
  | "no_matching_report"
  | "otterly_error";

export interface OptimizeResponse {
  status: OptimizeStatus;
  report?: OtterlyBrandReport;
  workspaceId?: string;
  defaultUrl?: string;
  siteHealth?: {
    audit: OtterlyContentCheckDetail | null;
  };
  wins?: PromptInsight[];
  quickWins?: PromptInsight[];
  gaps?: PromptInsight[];
  contentChecks?: OtterlyAuditCheck[];
  crawlabilityChecks?: OtterlyAuditCheck[];
  error?: { message: string; status: number };
}
