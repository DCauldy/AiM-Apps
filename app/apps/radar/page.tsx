import { RadarOtterlyDashboardClient } from "@/components/radar-otterly/DashboardClient";

// /apps/radar landing — Otterly-backed AI visibility dashboard for the
// agent's active profile. Auto-discovers the matching Otterly brand
// report by hostname (profile.website_url → brandDomain) and renders
// KPIs / competitors / detected brand landscape / cited sources /
// recommendations.
//
// The pre-Otterly Radar surface (radar_check / radar_audit / etc) is
// being torn down in a follow-up cleanup commit once this is verified
// against real data.
export default function RadarPage() {
  return <RadarOtterlyDashboardClient />;
}
