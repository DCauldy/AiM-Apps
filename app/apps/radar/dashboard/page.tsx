import { RadarOtterlyDashboardClient } from "@/components/radar-otterly/DashboardClient";

// /apps/radar/dashboard — Otterly-backed AI visibility dashboard for
// the agent's active profile. Auto-discovers the matching Otterly
// brand report by hostname (profile.website_url → brandDomain) and
// renders KPIs / competitor table / detected brand landscape /
// cited sources / recommendations.
export default function RadarDashboardPage() {
  return <RadarOtterlyDashboardClient />;
}
