import {
  RUN_SELECT,
  mapRenderRun,
  safeRenderMessage,
} from "./tour-render.repository.mappers";
import type {
  SupabaseClient,
  TourRenderRepository,
  TourRenderRunRow,
} from "./tour-render.repository.types";

export function createTourRenderRunsRepository(
  supabase: SupabaseClient
): Pick<
  TourRenderRepository,
  | "createRenderRun"
  | "getRenderRun"
  | "getRenderRunByIdForUser"
  | "listRecentRenderRuns"
  | "attachTriggerRunId"
  | "updateProgress"
  | "markCompleted"
  | "markFailed"
  | "recordHeartbeat"
  | "appendEvent"
> {
  return {
    async createRenderRun(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_render_runs")
        .insert({
          project_id: input.projectId,
          user_id: input.userId,
          status: "queued",
          current_step: "queued",
          current_step_label: "Queued",
          progress_percent: 0,
          scene_clip_completed_count: 0,
          scene_clip_total_count: input.sceneClipTotalCount ?? 0,
          options: input.options ?? {},
          heartbeat_at: now,
          updated_at: now,
        })
        .select(RUN_SELECT)
        .single<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async getRenderRun(input) {
      const { data, error } = await supabase
        .from("tour_render_runs")
        .select(RUN_SELECT)
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async getRenderRunByIdForUser(input) {
      const { data, error } = await supabase
        .from("tour_render_runs")
        .select(RUN_SELECT)
        .eq("id", input.runId)
        .eq("user_id", input.userId)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async listRecentRenderRuns(input) {
      const { data, error } = await supabase
        .from("tour_render_runs")
        .select(RUN_SELECT)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 5);

      if (error || !data) {
        return [];
      }

      return (data as TourRenderRunRow[]).map(mapRenderRun);
    },

    async attachTriggerRunId(input) {
      const { data, error } = await supabase
        .from("tour_render_runs")
        .update({
          trigger_run_id: input.triggerRunId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async updateProgress(input) {
      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        status: "running",
        current_step: input.step,
        current_step_label: input.label,
        progress_percent: input.progressPercent,
        heartbeat_at: now,
        updated_at: now,
      };

      if (typeof input.sceneClipCompletedCount === "number") {
        update.scene_clip_completed_count = input.sceneClipCompletedCount;
      }
      if (typeof input.sceneClipTotalCount === "number") {
        update.scene_clip_total_count = input.sceneClipTotalCount;
      }

      const { data, error } = await supabase
        .from("tour_render_runs")
        .update(update)
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async markCompleted(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_render_runs")
        .update({
          status: "completed",
          current_step: "completed",
          current_step_label: "Completed",
          progress_percent: 100,
          result_asset_id: input.resultAssetId,
          completed_at: now,
          heartbeat_at: now,
          updated_at: now,
        })
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async markFailed(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_render_runs")
        .update({
          status: "failed",
          current_step: input.step,
          current_step_label: input.label,
          error_message: safeRenderMessage(input.safeMessage),
          completed_at: now,
          heartbeat_at: now,
          updated_at: now,
        })
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async recordHeartbeat(input) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tour_render_runs")
        .update({
          heartbeat_at: now,
          updated_at: now,
        })
        .eq("id", input.runId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .select(RUN_SELECT)
        .maybeSingle<TourRenderRunRow>();

      if (error || !data) {
        return null;
      }

      return mapRenderRun(data);
    },

    async appendEvent(input) {
      const { data, error } = await supabase
        .from("tour_render_run_events")
        .insert({
          run_id: input.runId,
          project_id: input.projectId,
          step: input.step,
          status: input.status,
          message: safeRenderMessage(input.safeMessage),
          metadata: input.metadata ?? {},
        })
        .select("id")
        .single<{ id: string }>();

      return !error && Boolean(data);
    },
  };
}
