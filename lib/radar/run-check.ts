import { createServiceRoleClient } from "@/lib/supabase/server";
import { getConnector } from "@/lib/radar/connectors";
import { analyzeEngineResponse } from "@/lib/radar/analyzer";
import { calculateVisibilityScore, getEngineWeights } from "@/lib/radar/scoring";
import type {
  AIEngine,
  RadarConfig,
  RadarQuery,
  RadarResult,
  CheckTrigger,
  AlertType,
  AlertSeverity,
} from "@/types/radar";

interface RunCheckInput {
  userId: string;
  trigger: CheckTrigger;
}

/**
 * Standalone radar check function for dev mode (bypasses Inngest).
 * Mirrors the logic in lib/inngest/functions/radar-check.ts.
 */
export async function runRadarCheck({ userId, trigger }: RunCheckInput) {
  const supabase = createServiceRoleClient();

  // Step 1: Create check record
  const { data: check, error: checkError } = await supabase
    .from("radar_checks")
    .insert({
      user_id: userId,
      trigger,
      status: "running",
      engines_checked: [],
      engines_failed: [],
      queries_checked: 0,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (checkError || !check) {
    throw new Error(`Failed to create check: ${checkError?.message}`);
  }

  try {
    // Step 2: Load config
    const { data: configData, error: configError } = await supabase
      .from("radar_config")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (configError || !configData) {
      throw new Error(`Config not found for user ${userId}`);
    }
    const config = configData as RadarConfig;

    // Step 3: Load active queries
    const { data: queryData, error: queryError } = await supabase
      .from("radar_queries")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (queryError) {
      throw new Error(`Failed to load queries: ${queryError.message}`);
    }
    const queries = (queryData || []) as RadarQuery[];

    if (queries.length === 0) {
      await supabase
        .from("radar_checks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", check.id);
      console.log(`[Radar] Check completed (no queries) for user ${userId}`);
      return { success: true, checkId: check.id, resultsCount: 0, reason: "no_queries" };
    }

    // Step 4: Run engines
    const { data: competitors } = await supabase
      .from("radar_competitors")
      .select("name")
      .eq("user_id", userId);

    const competitorNames = (competitors || []).map((c: { name: string }) => c.name);

    const results: RadarResult[] = [];
    const enginesChecked = new Set<AIEngine>();
    const enginesFailed = new Set<AIEngine>();
    let queriesCompleted = 0;

    for (const query of queries) {
      for (const engine of config.monitored_engines) {
        try {
          const connector = getConnector(engine);
          const response = await connector.query(query.query_text);

          if (response.error) {
            console.error(`[Radar] Engine ${engine} error for query "${query.query_text}":`, response.error);
            enginesFailed.add(engine);
            continue;
          }

          const analyzed = await analyzeEngineResponse({
            responseText: response.responseText,
            brandVariations: config.brand_variations,
            queryText: query.query_text,
            competitors: competitorNames,
          });

          const { data: result } = await supabase
            .from("radar_results")
            .insert({
              check_id: check.id,
              user_id: userId,
              query_id: query.id,
              engine,
              brand_mentioned: analyzed.brand_mentioned,
              position: analyzed.position ?? null,
              sentiment: analyzed.sentiment ?? null,
              competitors_mentioned: analyzed.competitors_mentioned,
              citations: analyzed.citations,
              response_text: response.responseText,
              quality_score: analyzed.quality_score,
            })
            .select()
            .single();

          if (result) results.push(result as RadarResult);
          enginesChecked.add(engine);
        } catch (err) {
          console.error(`[Radar] Failed engine ${engine} for query "${query.query_text}":`, err);
          enginesFailed.add(engine);
        }
      }

      // Update progress after each query completes (all engines for that query)
      queriesCompleted++;
      await supabase
        .from("radar_checks")
        .update({
          queries_checked: queriesCompleted,
          engines_checked: Array.from(enginesChecked),
          engines_failed: Array.from(enginesFailed),
        })
        .eq("id", check.id);
    }

    // Step 5: Generate alerts
    const { data: previousCheck } = await supabase
      .from("radar_checks")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["completed", "completed_partial"])
      .neq("id", check.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousCheck) {
      const { data: previousResults } = await supabase
        .from("radar_results")
        .select("*")
        .eq("check_id", previousCheck.id);

      if (previousResults && previousResults.length > 0) {
        const alerts: {
          type: AlertType;
          severity: AlertSeverity;
          title: string;
          message: string;
          metadata: Record<string, unknown>;
        }[] = [];

        for (const current of results) {
          const previous = previousResults.find(
            (p: RadarResult) => p.query_id === current.query_id && p.engine === current.engine
          );
          if (!previous) continue;

          if (current.brand_mentioned && !previous.brand_mentioned) {
            alerts.push({
              type: "brand_appeared",
              severity: "positive",
              title: "Brand appeared in AI response",
              message: `Your brand is now mentioned by ${current.engine} for this query.`,
              metadata: { query_id: current.query_id, engine: current.engine, position: current.position },
            });
          }

          if (!current.brand_mentioned && previous.brand_mentioned) {
            alerts.push({
              type: "brand_disappeared",
              severity: "negative",
              title: "Brand no longer mentioned",
              message: `Your brand is no longer mentioned by ${current.engine} for this query.`,
              metadata: { query_id: current.query_id, engine: current.engine },
            });
          }

          if (
            current.brand_mentioned && previous.brand_mentioned &&
            current.position != null && previous.position != null &&
            current.position < previous.position
          ) {
            alerts.push({
              type: "position_improved",
              severity: "positive",
              title: "Position improved",
              message: `Your position improved from #${previous.position} to #${current.position} on ${current.engine}.`,
              metadata: { query_id: current.query_id, engine: current.engine, old_position: previous.position, new_position: current.position },
            });
          }

          if (
            current.brand_mentioned && previous.brand_mentioned &&
            current.position != null && previous.position != null &&
            current.position > previous.position
          ) {
            alerts.push({
              type: "position_declined",
              severity: "negative",
              title: "Position declined",
              message: `Your position dropped from #${previous.position} to #${current.position} on ${current.engine}.`,
              metadata: { query_id: current.query_id, engine: current.engine, old_position: previous.position, new_position: current.position },
            });
          }

          const newCompetitors = current.competitors_mentioned.filter(
            (c: string) => !previous.competitors_mentioned.includes(c)
          );
          for (const competitor of newCompetitors) {
            alerts.push({
              type: "new_competitor",
              severity: "info",
              title: "New competitor detected",
              message: `"${competitor}" is now being mentioned by ${current.engine}.`,
              metadata: { query_id: current.query_id, engine: current.engine, competitor },
            });
          }

          const newCitations = current.citations.filter(
            (c: string) => !previous.citations.includes(c)
          );
          if (newCitations.length > 0 && current.brand_mentioned) {
            alerts.push({
              type: "citation_gained",
              severity: "positive",
              title: "New citation gained",
              message: `Your content is now being cited by ${current.engine}.`,
              metadata: { query_id: current.query_id, engine: current.engine, citations: newCitations },
            });
          }

          const lostCitations = previous.citations.filter(
            (c: string) => !current.citations.includes(c)
          );
          if (lostCitations.length > 0 && previous.brand_mentioned) {
            alerts.push({
              type: "citation_lost",
              severity: "negative",
              title: "Citation lost",
              message: `A citation was removed from ${current.engine}'s response.`,
              metadata: { query_id: current.query_id, engine: current.engine, citations: lostCitations },
            });
          }
        }

        if (alerts.length > 0) {
          await supabase.from("radar_alerts").insert(
            alerts.map((a) => ({
              user_id: userId,
              check_id: check.id,
              type: a.type,
              severity: a.severity,
              title: a.title,
              message: a.message,
              metadata: a.metadata,
              read: false,
            }))
          );
        }
      }
    }

    // Step 6: Compute visibility score
    const engineWeights = await getEngineWeights();
    const visibilityScore = calculateVisibilityScore(results, engineWeights);

    // Step 7: Finalize
    const hasFailed = enginesFailed.size > 0;
    await supabase
      .from("radar_checks")
      .update({
        status: hasFailed ? "completed_partial" : "completed",
        engines_checked: Array.from(enginesChecked),
        engines_failed: Array.from(enginesFailed),
        queries_checked: queries.length,
        visibility_score: visibilityScore,
        completed_at: new Date().toISOString(),
      })
      .eq("id", check.id);

    await supabase
      .from("radar_config")
      .update({
        last_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    console.log(
      `[Radar] Check completed for user ${userId}: score=${visibilityScore}, results=${results.length}, failed_engines=${enginesFailed.size}`
    );

    return {
      success: true,
      checkId: check.id,
      visibilityScore,
      resultsCount: results.length,
      enginesChecked: Array.from(enginesChecked),
      enginesFailed: Array.from(enginesFailed),
      trigger,
    };
  } catch (err) {
    // Mark check as failed on error
    await supabase
      .from("radar_checks")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", check.id);

    throw err;
  }
}
