import { RadarMonitorClient } from "@/components/radar-otterly/MonitorClient";

// /apps/radar/monitor — trends over time.
//
// Line charts driven by the time-series fields in the dashboard
// stats response (brandCoverageHistory, brandRankHistory,
// brandVisibilityIndex, domainCoverageHistory). Sparse for the
// first ~14 days of a new brand report — Otterly populates one
// data point per day per engine.
export default function RadarMonitorPage() {
  return <RadarMonitorClient />;
}
