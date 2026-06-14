import "server-only";

import { createOtterlyClient, type OtterlyClient } from "./client";
import type {
  OtterlyAccountInfo,
  OtterlyAuditCheck,
  OtterlyBrandReport,
  OtterlyBrandReportStats,
  OtterlyCitation,
  OtterlyContentCheckDetail,
  OtterlyCrawlabilityCheckDetail,
  OtterlyListResponse,
  OtterlyPromptDetail,
  OtterlyPromptSummary,
  OtterlyRecommendation,
  OtterlyWorkspace,
  CreateAuditCheckInput,
} from "./types";

// ============================================================
// Typed accessors over the raw Otterly client. One function per
// endpoint we actually use in the rebuilt Radar dashboard. Centralizes
// path strings + query-param assembly + response typing so route
// handlers and page loaders read like business logic, not URL juggling.
//
// All accessors take an optional client so callers can inject a
// custom one (e.g. for tests, alternate base URL, or a different API
// key per request — eventually relevant for the multi-tenant story).
// ============================================================

function client(c?: OtterlyClient): OtterlyClient {
  return c ?? createOtterlyClient();
}

// ---------------------------------------------------------------------------
// Account / workspaces
// ---------------------------------------------------------------------------

export function getAccountInfo(c?: OtterlyClient): Promise<OtterlyAccountInfo> {
  return client(c).raw<OtterlyAccountInfo>("/v1/accounts/info");
}

export function listWorkspaces(
  c?: OtterlyClient,
): Promise<OtterlyListResponse<OtterlyWorkspace>> {
  return client(c).raw<OtterlyListResponse<OtterlyWorkspace>>("/v1/workspaces");
}

// ---------------------------------------------------------------------------
// Brand reports
// ---------------------------------------------------------------------------

export interface ListReportsOptions {
  workspaceId?: string;
  cursor?: string;
}

export function listBrandReports(
  opts: ListReportsOptions = {},
  c?: OtterlyClient,
): Promise<OtterlyListResponse<OtterlyBrandReport>> {
  const qs = new URLSearchParams();
  if (opts.workspaceId) qs.set("workspaceId", opts.workspaceId);
  if (opts.cursor) qs.set("cursor", opts.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return client(c).raw<OtterlyListResponse<OtterlyBrandReport>>(
    `/v1/reports/brand${suffix}`,
  );
}

export function getBrandReport(
  reportId: string,
  c?: OtterlyClient,
): Promise<OtterlyBrandReport> {
  return client(c).raw<OtterlyBrandReport>(`/v1/reports/brand/${reportId}`);
}

export interface StatsRangeOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  country: string; // ISO-3166-1 alpha-2, lowercase
  engines?: string[];
  tagId?: string;
}

function rangeQs(opts: StatsRangeOptions): string {
  const qs = new URLSearchParams();
  qs.set("startDate", opts.startDate);
  qs.set("endDate", opts.endDate);
  qs.set("country", opts.country);
  if (opts.engines?.length) qs.set("engines", opts.engines.join(","));
  if (opts.tagId) qs.set("tagId", opts.tagId);
  return qs.toString();
}

export function getBrandReportStats(
  reportId: string,
  opts: StatsRangeOptions,
  c?: OtterlyClient,
): Promise<OtterlyBrandReportStats> {
  return client(c).raw<OtterlyBrandReportStats>(
    `/v1/reports/brand/${reportId}/stats?${rangeQs(opts)}`,
  );
}

export function getBrandReportRecommendations(
  reportId: string,
  opts: { country: string; engine?: string },
  c?: OtterlyClient,
): Promise<OtterlyListResponse<OtterlyRecommendation>> {
  const qs = new URLSearchParams();
  qs.set("country", opts.country);
  if (opts.engine) qs.set("engine", opts.engine);
  return client(c).raw<OtterlyListResponse<OtterlyRecommendation>>(
    `/v1/reports/brand/${reportId}/recommendations?${qs.toString()}`,
  );
}

// ---------------------------------------------------------------------------
// Research — per-prompt aggregates + citations.
// All three endpoints require the same startDate/endDate/country
// triple as the stats call.
// ---------------------------------------------------------------------------

export function listBrandReportPrompts(
  reportId: string,
  opts: StatsRangeOptions,
  c?: OtterlyClient,
): Promise<OtterlyListResponse<OtterlyPromptSummary>> {
  return client(c).raw<OtterlyListResponse<OtterlyPromptSummary>>(
    `/v1/reports/brand/${reportId}/prompts?${rangeQs(opts)}`,
  );
}

export function getBrandReportPrompt(
  reportId: string,
  promptId: string,
  opts: StatsRangeOptions,
  c?: OtterlyClient,
): Promise<OtterlyPromptDetail> {
  return client(c).raw<OtterlyPromptDetail>(
    `/v1/reports/brand/${reportId}/prompts/${promptId}?${rangeQs(opts)}`,
  );
}

export function listBrandReportCitations(
  reportId: string,
  opts: StatsRangeOptions,
  c?: OtterlyClient,
): Promise<OtterlyListResponse<OtterlyCitation>> {
  return client(c).raw<OtterlyListResponse<OtterlyCitation>>(
    `/v1/reports/brand/${reportId}/citations?${rangeQs(opts)}`,
  );
}

// ---------------------------------------------------------------------------
// GEO audits — URL-driven, scoped to a workspace
// ---------------------------------------------------------------------------

export function createContentCheck(
  input: CreateAuditCheckInput,
  c?: OtterlyClient,
): Promise<OtterlyAuditCheck> {
  return client(c).raw<OtterlyAuditCheck>("/v1/audits/geo/content-checks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createCrawlabilityCheck(
  input: Pick<CreateAuditCheckInput, "workspaceId" | "url">,
  c?: OtterlyClient,
): Promise<OtterlyAuditCheck> {
  return client(c).raw<OtterlyAuditCheck>(
    "/v1/audits/geo/crawlability-checks",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function getContentCheck(
  id: string,
  c?: OtterlyClient,
): Promise<OtterlyContentCheckDetail> {
  return client(c).raw<OtterlyContentCheckDetail>(
    `/v1/audits/geo/content-checks/${id}`,
  );
}

export function getCrawlabilityCheck(
  id: string,
  c?: OtterlyClient,
): Promise<OtterlyCrawlabilityCheckDetail> {
  return client(c).raw<OtterlyCrawlabilityCheckDetail>(
    `/v1/audits/geo/crawlability-checks/${id}`,
  );
}

export function listContentChecks(
  c?: OtterlyClient,
): Promise<OtterlyListResponse<OtterlyAuditCheck>> {
  return client(c).raw<OtterlyListResponse<OtterlyAuditCheck>>(
    "/v1/audits/geo/content-checks",
  );
}

export function listCrawlabilityChecks(
  c?: OtterlyClient,
): Promise<OtterlyListResponse<OtterlyAuditCheck>> {
  return client(c).raw<OtterlyListResponse<OtterlyAuditCheck>>(
    "/v1/audits/geo/crawlability-checks",
  );
}
