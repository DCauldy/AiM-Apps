import { createServiceRoleClient } from "@/lib/supabase/server";
import type { AIEngine, RadarResult, EngineWeights } from "@/types/radar";

// ---------------------------------------------------------------------------
// Default engine weights (used when no admin_settings override exists)
// ---------------------------------------------------------------------------

const DEFAULT_ENGINE_WEIGHTS: EngineWeights = {
  chatgpt: 25,
  perplexity: 20,
  gemini: 15,
  google_aio: 15,
  google_ai_mode: 10,
  copilot: 5,
  claude: 5,
  grok: 5,
};

// ---------------------------------------------------------------------------
// Quality Score (per result): 0-10
// ---------------------------------------------------------------------------

/**
 * Calculate a quality score (0-10) for a single engine result.
 *
 * Scoring table:
 *  - Not mentioned: 0
 *  - Mentioned negatively: 1
 *  - Mentioned neutrally, no position: 3
 *  - Mentioned positively, no position: 4
 *  - Mentioned positively, position 4+: 5
 *  - Mentioned positively, position 2-3: 7
 *  - Mentioned positively, position 1: 8
 *  - Mentioned positively, position 1 + citation: 10
 */
export function calculateQualityScore(result: {
  brand_mentioned: boolean;
  position?: number;
  sentiment?: "positive" | "neutral" | "negative";
  citations: string[];
}): number {
  if (!result.brand_mentioned) return 0;

  if (result.sentiment === "negative") return 1;

  if (result.sentiment === "neutral" || !result.sentiment) {
    return result.position ? 3 : 3;
  }

  // Positive sentiment from here
  if (!result.position) return 4;

  if (result.position >= 4) return 5;
  if (result.position >= 2) return 7;

  // Position 1
  if (result.citations.length > 0) return 10;
  return 8;
}

// ---------------------------------------------------------------------------
// Visibility Score (across all results for a check): 0-100
// ---------------------------------------------------------------------------

/**
 * Calculate the overall visibility score (0-100) from a set of results.
 *
 * Formula:
 *  1. Per engine: sum of quality scores / max possible (10 * number of queries for that engine)
 *  2. Weighted: per-engine percentage * engine weight
 *  3. Final: sum of weighted / sum of active weights * 100
 */
export function calculateVisibilityScore(
  results: RadarResult[],
  engineWeights: EngineWeights
): number {
  // Group results by engine
  const byEngine = new Map<AIEngine, RadarResult[]>();
  for (const r of results) {
    const existing = byEngine.get(r.engine) || [];
    existing.push(r);
    byEngine.set(r.engine, existing);
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [engine, engineResults] of byEngine) {
    const weight = engineWeights[engine] ?? 0;
    if (weight === 0) continue;

    const maxPossible = engineResults.length * 10;
    if (maxPossible === 0) continue;

    const actualScore = engineResults.reduce(
      (sum, r) => sum + r.quality_score,
      0
    );
    const enginePercentage = actualScore / maxPossible;

    weightedSum += enginePercentage * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;

  return Math.round((weightedSum / totalWeight) * 100);
}

// ---------------------------------------------------------------------------
// Share of Voice: percentage
// ---------------------------------------------------------------------------

/**
 * Calculate share of voice as a percentage.
 *
 * Share of voice = user mentions / (user mentions + competitor mentions) * 100.
 */
export function calculateShareOfVoice(
  userResults: RadarResult[],
  competitorResults: RadarResult[]
): number {
  const userMentions = userResults.filter((r) => r.brand_mentioned).length;
  const competitorMentions = competitorResults.filter(
    (r) => r.brand_mentioned
  ).length;

  const total = userMentions + competitorMentions;
  if (total === 0) return 0;

  return Math.round((userMentions / total) * 100);
}

// ---------------------------------------------------------------------------
// Engine Weights from admin_settings
// ---------------------------------------------------------------------------

/**
 * Read RADAR_ENGINE_WEIGHTS from admin_settings table.
 * Falls back to DEFAULT_ENGINE_WEIGHTS if not found.
 */
export async function getEngineWeights(): Promise<EngineWeights> {
  try {
    const supabase = createServiceRoleClient();

    const { data } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "RADAR_ENGINE_WEIGHTS")
      .maybeSingle();

    if (data?.value && typeof data.value === "object") {
      return { ...DEFAULT_ENGINE_WEIGHTS, ...(data.value as Partial<EngineWeights>) };
    }
  } catch {
    // Fall through to default
  }

  return { ...DEFAULT_ENGINE_WEIGHTS };
}
