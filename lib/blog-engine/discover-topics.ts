import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getResearchModel, getScoringModel } from "@/lib/openrouter";
import { getResearchPrompt, getScoringPrompt } from "@/lib/blog-engine/prompts";
import { checkTopicDuplicate } from "@/lib/blog-engine/dedup";
import { getProfileForBlogEngine } from "@/lib/profiles/effective-profile";
import { generateText } from "ai";
import type { BofuTopic } from "@/types/blog-engine";

// Standalone topic discovery. Mirrors steps 1–4 of blog-pipeline.ts but
// skips the slot reservation / blog generation / publish so users can
// refill their topic bank without consuming a weekly cap slot. Used by:
//   - the manual "Discover Topics" button on /apps/blog-engine/topics
//   - (future) any scheduled bank-refill cron
//
// Returns the count of new topics saved + the run id for telemetry.
export async function discoverTopicsForUser(userId: string): Promise<{
  rawCount: number;
  savedCount: number;
  runId: string | null;
}> {
  const supabase = createServiceRoleClient();

  // 1. Profile is required for the research prompt.
  const profile = await getProfileForBlogEngine(userId);
  if (!profile) {
    throw new Error("Profile not found");
  }

  // 2. Open a discovery run row up-front so the UI can show "researching".
  const { data: run } = await supabase
    .from("bofu_discovery_runs")
    .insert({
      user_id: userId,
      status: "researching",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  const runId = run?.id ?? null;

  // 3. Perplexity-powered research.
  const researchPrompt = getResearchPrompt(profile);
  const { text: researchResult } = await generateText({
    model: getResearchModel(),
    prompt: researchPrompt,
    temperature: 0.7,
  });

  type RawTopic = {
    title: string;
    description: string;
    inquiry_type: string;
    search_queries: string[];
    source?: string;
  };

  let rawTopics: RawTopic[] = [];
  try {
    const jsonMatch = researchResult.match(/\[[\s\S]*\]/);
    if (jsonMatch) rawTopics = JSON.parse(jsonMatch[0]);
  } catch {
    console.error("[discover-topics] failed to parse research results");
  }

  if (runId) {
    await supabase
      .from("bofu_discovery_runs")
      .update({
        status: rawTopics.length > 0 ? "scoring" : "failed",
        queries_generated: rawTopics.length,
        research_summary: { raw_count: rawTopics.length },
      })
      .eq("id", runId);
  }

  if (rawTopics.length === 0) {
    return { rawCount: 0, savedCount: 0, runId };
  }

  // 4. GPT-4o scoring + dedup-aware save.
  const scoringPrompt = getScoringPrompt(profile);
  const { text: scoringResult } = await generateText({
    model: getScoringModel(),
    messages: [
      { role: "system", content: scoringPrompt },
      {
        role: "user",
        content: `Score these topics:\n\n${JSON.stringify(rawTopics, null, 2)}`,
      },
    ],
    temperature: 0.3,
  });

  type ScoredTopic = {
    title: string;
    description: string;
    inquiry_type: string;
    search_queries: string[];
    bofu_score: number;
    scoring_breakdown: Record<string, number>;
    rank: number;
  };

  let scoredTopics: ScoredTopic[] = [];
  try {
    const jsonMatch = scoringResult.match(/\[[\s\S]*\]/);
    if (jsonMatch) scoredTopics = JSON.parse(jsonMatch[0]);
  } catch {
    console.error("[discover-topics] failed to parse scoring results");
  }

  const saved: BofuTopic[] = [];
  for (const topic of scoredTopics) {
    const dedup = await checkTopicDuplicate(userId, topic.title);
    if (dedup.isDuplicate) {
      continue;
    }
    const { data: row } = await supabase
      .from("bofu_topics")
      .insert({
        user_id: userId,
        discovery_run_id: runId,
        title: topic.title,
        description: topic.description,
        search_queries: topic.search_queries || [],
        inquiry_type: topic.inquiry_type,
        bofu_score: topic.bofu_score,
        scoring_breakdown: topic.scoring_breakdown,
        rank: topic.rank,
        status: "unused",
        ...(dedup.embedding
          ? { embedding: `[${dedup.embedding.join(",")}]` }
          : {}),
      })
      .select()
      .single();
    if (row) saved.push(row as BofuTopic);
  }

  if (runId) {
    await supabase
      .from("bofu_discovery_runs")
      .update({
        status: "completed",
        topics_scored: scoredTopics.length,
        topics_selected: saved.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }

  return { rawCount: rawTopics.length, savedCount: saved.length, runId };
}
