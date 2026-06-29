import { RadarResearchClient } from "@/components/radar-otterly/ResearchClient";

// /apps/radar/research — per-prompt drill-down. Lists all tracked
// prompts for the active profile's matched brand report, with
// mention/coverage summaries. Expand a row to see the full per-prompt
// breakdown (sentiment, brand rank, domain mix, cited URLs).
//
// Verbatim AI response text isn't exposed by the Otterly public API
// (only aggregates) so this is a prompts × outcomes view rather than
// a raw-response viewer.
export default function RadarResearchPage() {
  return <RadarResearchClient />;
}
