import { DashboardSkeleton } from "./dashboard/DashboardSkeleton";

// Renders inside the CMA layout chrome (header stays mounted) until
// the route's server fetch resolves. Mirrors the cadence dashboard —
// that's the default landing destination from the AppSwitcher and
// the most common navigation target.
export default function ListingStudioLoading() {
  return <DashboardSkeleton />;
}
