import { RadarOtterlyDashboardSkeleton } from "@/components/radar-otterly/DashboardSkeleton";

// Renders during navigation into /apps/radar/dashboard. Mirrors the
// real dashboard layout (KPI strip + 4 panels) so transition from
// skeleton → loaded is silent.
export default function RadarDashboardLoading() {
  return <RadarOtterlyDashboardSkeleton />;
}
