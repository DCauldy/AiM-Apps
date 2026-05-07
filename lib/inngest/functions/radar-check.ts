import { inngest } from "@/lib/inngest/client";
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

// ---------------------------------------------------------------------------
// Event type
// ---------------------------------------------------------------------------

type RadarCheckEvent = {
  name: "radar/check.requested";
  data: {
    userId: string;
    trigger: CheckTrigger;
  };
};

// ---------------------------------------------------------------------------
// Radar Check — Inngest function
// ---------------------------------------------------------------------------

export const radarCheck = inngest.createFunction(
  {
    id: "radar-check",
    name: "Radar Visibility Check",
    retries: 2,
    concurrency: [{ limit: 3 }],
    triggers: [{ event: "radar/check.requested" }],
  },
  async ({ event, step }: { event: { data: RadarCheckEvent["data"]; id?: string }; step: any }) => {
    const { userId, trigger } = event.data;
    const supabase = createServiceRoleClient();

    // -----------------------------------------------------------------------
    // Step 1: Create check record
    // -----------------------------------------------------------------------
    const check = await step.run("create-check", async () => {
      const { data, error } = await supabase
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

      if (error || !data) {
        throw new Error(`Failed to create check: ${error?.message}`);
      }
      return data;
    });

    // -----------------------------------------------------------------------
    // Step 2: Load config
    // -----------------------------------------------------------------------
    const config = await step.run("load-config", async () => {
      const { data, error } = await supabase
        .from("radar_config")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        throw new Error(`Config not found for user ${userId}`);
      }
      return data as RadarConfig;
    });

    // -----------------------------------------------------------------------
    // Step 3: Load active queries
    // -----------------------------------------------------------------------
    const queries = await step.run("load-queries", async () => {
      const { data, error } = await supabase
        .from("radar_queries")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (error) {
        throw new Error(`Failed to load queries: ${error.message}`);
      }

      return (data || []) as RadarQuery[];
    });

    if (queries.length === 0) {
      // No queries to check — finalize immediately
      await step.run("finalize-no-queries", async () => {
        await supabase
          .from("radar_checks")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", check.id);
      });

      return { success: true, checkId: check.id, resultsCount: 0, reason: "no_queries" };
    }

    // -----------------------------------------------------------------------
    // Step 4: Run engines
    // -----------------------------------------------------------------------
    const runResults = await step.run("run-engines", async () => {
      // Load competitors for analysis context
      const { data: competitors } = await supabase
        .from("radar_competitors")
        .select("name")
        .eq("user_id", userId);

      const competitorNames = (competitors || []).map((c: { name: string }) => c.name);

      const results: RadarResult[] = [];
      const enginesChecked = new Set<AIEngine>();
      const enginesFailed = new Set<AIEngine>();

      for (const query of queries) {
        for (const engine of config.monitored_engines) {
          try {
            const connector = getConnector(engine);
            const response = await connector.query(query.query_text);

            if (response.error) {
              console.error(
                `[Radar] Engine ${engine} error for query "${query.query_text}":`,
                response.error
              );
              enginesFailed.add(engine);
              continue;
            }

            // Analyze the response
            const analyzed = await analyzeEngineResponse({
              responseText: response.responseText,
              brandVariations: config.brand_variations,
              queryText: query.query_text,
              competitors: competitorNames,
            });

            // Write result
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

            if (result) {
              results.push(result as RadarResult);
            }

            enginesChecked.add(engine);
          } catch (err) {
            console.error(
              `[Radar] Failed engine ${engine} for query "${query.query_text}":`,
              err
            );
            enginesFailed.add(engine);
          }
        }
      }

      return {
        results,
        enginesChecked: Array.from(enginesChecked),
        enginesFailed: Array.from(enginesFailed),
      };
    });

    // -----------------------------------------------------------------------
    // Step 5: Generate alerts
    // -----------------------------------------------------------------------
    await step.run("generate-alerts", async () => {
      // Load previous check results for comparison
      const { data: previousCheck } = await supabase
        .from("radar_checks")
        .select("id")
        .eq("user_id", userId)
        .in("status", ["completed", "completed_partial"])
        .neq("id", check.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!previousCheck) {
        // First check — no alerts to generate
        return { alerts: 0 };
      }

      const { data: previousResults } = await supabase
        .from("radar_results")
        .select("*")
        .eq("check_id", previousCheck.id);

      if (!previousResults || previousResults.length === 0) {
        return { alerts: 0 };
      }

      const alerts: {
        type: AlertType;
        severity: AlertSeverity;
        title: string;
        message: string;
        metadata: Record<string, unknown>;
      }[] = [];

      // Compare current vs previous for each query/engine combination
      for (const current of runResults.results) {
        const previous = previousResults.find(
          (p: RadarResult) =>
            p.query_id === current.query_id && p.engine === current.engine
        );

        if (!previous) continue;

        // Brand appeared
        if (current.brand_mentioned && !previous.brand_mentioned) {
          alerts.push({
            type: "brand_appeared",
            severity: "positive",
            title: "Brand appeared in AI response",
            message: `Your brand is now mentioned by ${current.engine} for this query.`,
            metadata: {
              query_id: current.query_id,
              engine: current.engine,
              position: current.position,
            },
          });
        }

        // Brand disappeared
        if (!current.brand_mentioned && previous.brand_mentioned) {
          alerts.push({
            type: "brand_disappeared",
            severity: "negative",
            title: "Brand no longer mentioned",
            message: `Your brand is no longer mentioned by ${current.engine} for this query.`,
            metadata: {
              query_id: current.query_id,
              engine: current.engine,
            },
          });
        }

        // Position improved
        if (
          current.brand_mentioned &&
          previous.brand_mentioned &&
          current.position != null &&
          previous.position != null &&
          current.position < previous.position
        ) {
          alerts.push({
            type: "position_improved",
            severity: "positive",
            title: "Position improved",
            message: `Your position improved from #${previous.position} to #${current.position} on ${current.engine}.`,
            metadata: {
              query_id: current.query_id,
              engine: current.engine,
              old_position: previous.position,
              new_position: current.position,
            },
          });
        }

        // Position declined
        if (
          current.brand_mentioned &&
          previous.brand_mentioned &&
          current.position != null &&
          previous.position != null &&
          current.position > previous.position
        ) {
          alerts.push({
            type: "position_declined",
            severity: "negative",
            title: "Position declined",
            message: `Your position dropped from #${previous.position} to #${current.position} on ${current.engine}.`,
            metadata: {
              query_id: current.query_id,
              engine: current.engine,
              old_position: previous.position,
              new_position: current.position,
            },
          });
        }

        // New competitor
        const newCompetitors = current.competitors_mentioned.filter(
          (c: string) => !previous.competitors_mentioned.includes(c)
        );
        for (const competitor of newCompetitors) {
          alerts.push({
            type: "new_competitor",
            severity: "info",
            title: "New competitor detected",
            message: `"${competitor}" is now being mentioned by ${current.engine}.`,
            metadata: {
              query_id: current.query_id,
              engine: current.engine,
              competitor,
            },
          });
        }

        // Citation gained
        const newCitations = current.citations.filter(
          (c: string) => !previous.citations.includes(c)
        );
        if (newCitations.length > 0 && current.brand_mentioned) {
          alerts.push({
            type: "citation_gained",
            severity: "positive",
            title: "New citation gained",
            message: `Your content is now being cited by ${current.engine}.`,
            metadata: {
              query_id: current.query_id,
              engine: current.engine,
              citations: newCitations,
            },
          });
        }

        // Citation lost
        const lostCitations = previous.citations.filter(
          (c: string) => !current.citations.includes(c)
        );
        if (lostCitations.length > 0 && previous.brand_mentioned) {
          alerts.push({
            type: "citation_lost",
            severity: "negative",
            title: "Citation lost",
            message: `A citation was removed from ${current.engine}'s response.`,
            metadata: {
              query_id: current.query_id,
              engine: current.engine,
              citations: lostCitations,
            },
          });
        }
      }

      // Insert alerts
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

      return { alerts: alerts.length };
    });

    // -----------------------------------------------------------------------
    // Step 6: Compute visibility score
    // -----------------------------------------------------------------------
    const visibilityScore = await step.run("compute-score", async () => {
      const engineWeights = await getEngineWeights();
      return calculateVisibilityScore(runResults.results, engineWeights);
    });

    // -----------------------------------------------------------------------
    // Step 7: Finalize
    // -----------------------------------------------------------------------
    await step.run("finalize", async () => {
      const hasFailed = runResults.enginesFailed.length > 0;
      const status = hasFailed ? "completed_partial" : "completed";

      await supabase
        .from("radar_checks")
        .update({
          status,
          engines_checked: runResults.enginesChecked,
          engines_failed: runResults.enginesFailed,
          queries_checked: queries.length,
          visibility_score: visibilityScore,
          completed_at: new Date().toISOString(),
        })
        .eq("id", check.id);

      // Update config with last_check_at
      await supabase
        .from("radar_config")
        .update({
          last_check_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      console.log(
        `[Radar] Check completed for user ${userId}: score=${visibilityScore}, results=${runResults.results.length}, failed_engines=${runResults.enginesFailed.length}`
      );
    });

    return {
      success: true,
      checkId: check.id,
      visibilityScore,
      resultsCount: runResults.results.length,
      enginesChecked: runResults.enginesChecked,
      enginesFailed: runResults.enginesFailed,
      trigger,
    };
  }
);
