import { generateText } from "ai";
import { getRadarAnalyzerModel } from "@/lib/openrouter";
import { getAnalyzerPrompt } from "@/lib/radar/prompts";
import { calculateQualityScore } from "@/lib/radar/scoring";
import type { AnalyzedResult } from "@/types/radar";

/**
 * Analyze an AI engine's response to extract brand visibility data.
 */
export async function analyzeEngineResponse(params: {
  responseText: string;
  brandVariations: string[];
  queryText: string;
  competitors: string[];
}): Promise<AnalyzedResult> {
  const { responseText, brandVariations, queryText, competitors } = params;

  const userMessage = `## Query
"${queryText}"

## Brand Variations to Look For
${brandVariations.map((v) => `- "${v}"`).join("\n")}

## Known Competitors to Track
${competitors.length > 0 ? competitors.map((c) => `- "${c}"`).join("\n") : "None specified — identify any businesses mentioned."}

## AI Engine Response
${responseText}`;

  const { text } = await generateText({
    model: getRadarAnalyzerModel(),
    system: getAnalyzerPrompt(),
    prompt: userMessage,
  });

  // Parse the LLM response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // If parsing fails, return a safe default
    return {
      brand_mentioned: false,
      position: undefined,
      sentiment: undefined,
      competitors_mentioned: [],
      citations: [],
      quality_score: 0,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const result = {
      brand_mentioned: Boolean(parsed.brand_mentioned),
      position: parsed.position ?? undefined,
      sentiment: parsed.sentiment ?? undefined,
      competitors_mentioned: Array.isArray(parsed.competitors_mentioned)
        ? parsed.competitors_mentioned
        : [],
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
    };

    return {
      ...result,
      quality_score: calculateQualityScore(result),
    };
  } catch {
    return {
      brand_mentioned: false,
      position: undefined,
      sentiment: undefined,
      competitors_mentioned: [],
      citations: [],
      quality_score: 0,
    };
  }
}
