import { RadarOtterlyDashboardSkeleton } from "@/components/radar-otterly/DashboardSkeleton";

// Renders during navigation into /apps/radar. Mirrors the Otterly-backed
// dashboard layout (KPI strip + 4 panels) so the transition from
// skeleton → loaded is silent.
export default function RadarLoading() {
  return <RadarOtterlyDashboardSkeleton />;
}
