import { RadarOptimizeClient } from "@/components/radar-otterly/OptimizeClient";

// /apps/radar/optimize — action layer.
//
//   1. Otterly recommendations for the brand report (suggested
//      actions that improve AI visibility).
//   2. On-demand URL audits (content check + crawlability check)
//      with rich score breakdowns once the audit completes.
//   3. Audit history (per URL, expandable to score detail).
export default function RadarOptimizePage() {
  return <RadarOptimizeClient />;
}
