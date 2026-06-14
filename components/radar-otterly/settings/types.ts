import type {
  OtterlyAccountInfo,
  OtterlyBrandReport,
} from "@/lib/radar-otterly/types";

// Shared types for the Settings tab files.
//
// SettingsClient fetches /api/apps/radar/settings once and routes
// chunks of the payload to each tab. Each tab component takes only
// what it needs as props — see per-tab files in this directory.

export type SettingsStatus =
  | "ready"
  | "no_active_profile"
  | "no_website_url"
  | "no_matching_report"
  | "otterly_error";

export interface SettingsCapacity {
  promptsCap: number;
  promptsUsed: number;
  competitorsCap: number;
  competitorsUsed: number;
}

export interface SettingsResponse {
  status: SettingsStatus;
  report?: OtterlyBrandReport;
  account?: OtterlyAccountInfo;
  websiteUrl?: string;
  capacity?: SettingsCapacity;
  trackedPrompts?: Array<{ id: string; prompt: string }>;
  error?: { message: string; status: number };
}

export type Tab = "tracking" | "quota" | "notifications" | "upgrade";

export const TABS: { id: Tab; label: string }[] = [
  { id: "tracking", label: "Tracking" },
  { id: "quota", label: "Quota" },
  { id: "notifications", label: "Notifications" },
  { id: "upgrade", label: "Upgrade" },
];
