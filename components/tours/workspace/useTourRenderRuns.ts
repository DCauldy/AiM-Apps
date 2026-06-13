"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isTourRenderRunActive,
  type TourRenderRunStatusResponse,
} from "@/lib/tours/rendering/tour-render.contract";

type RenderRunsResponse = {
  runs: TourRenderRunStatusResponse[];
};

type RenderRunResponse = {
  run: TourRenderRunStatusResponse;
};

async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? fallbackError);
  }
  return payload as T;
}

async function fetchRecentRenderRuns(projectId: string): Promise<TourRenderRunStatusResponse[]> {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/render-runs`);
  const payload = await readJsonResponse<RenderRunsResponse>(
    response,
    "Could not load render status."
  );
  return payload.runs;
}

async function fetchRenderRunStatus(
  projectId: string,
  runId: string
): Promise<TourRenderRunStatusResponse> {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/render-runs/${runId}/status`);
  const payload = await readJsonResponse<RenderRunResponse>(
    response,
    "Could not load render status."
  );
  return payload.run;
}

async function createRenderRun(projectId: string): Promise<TourRenderRunStatusResponse> {
  const response = await fetch(`/api/apps/tours/projects/${projectId}/render-runs`, {
    method: "POST",
  });
  const payload = await readJsonResponse<RenderRunResponse>(
    response,
    "Could not start rendering."
  );
  return payload.run;
}

function pickDisplayRun(runs: TourRenderRunStatusResponse[]): TourRenderRunStatusResponse | null {
  return runs.find(isTourRenderRunActive) ?? runs[0] ?? null;
}

export function useTourRenderRuns(projectId: string) {
  const queryClient = useQueryClient();
  const recentRunsQueryKey = useMemo(
    () => ["tours", "render-runs", projectId] as const,
    [projectId]
  );

  const recentRunsQuery = useQuery({
    queryKey: recentRunsQueryKey,
    queryFn: () => fetchRecentRenderRuns(projectId),
    refetchOnWindowFocus: false,
  });

  const displayRun = pickDisplayRun(recentRunsQuery.data ?? []);
  const activeRunId = displayRun && isTourRenderRunActive(displayRun) ? displayRun.id : null;

  const activeRunQuery = useQuery({
    queryKey: ["tours", "render-runs", projectId, activeRunId, "status"],
    queryFn: () => fetchRenderRunStatus(projectId, activeRunId as string),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const run = query.state.data;
      return run && isTourRenderRunActive(run) ? 2_000 : false;
    },
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!activeRunQuery.data) {
      return;
    }

    queryClient.setQueryData<TourRenderRunStatusResponse[]>(recentRunsQueryKey, (runs = []) => [
      activeRunQuery.data,
      ...runs.filter((run) => run.id !== activeRunQuery.data?.id),
    ]);
  }, [activeRunQuery.data, queryClient, recentRunsQueryKey]);

  const currentRun = activeRunQuery.data ?? displayRun;
  const createRenderRunMutation = useMutation({
    mutationFn: () => createRenderRun(projectId),
    onSuccess: (run) => {
      queryClient.setQueryData<TourRenderRunStatusResponse[]>(recentRunsQueryKey, (runs = []) => [
        run,
        ...runs.filter((existingRun) => existingRun.id !== run.id),
      ]);
    },
  });

  return {
    currentRun,
    recentRuns: recentRunsQuery.data ?? [],
    isLoadingRecentRuns: recentRunsQuery.isLoading,
    isPollingActiveRun: activeRunQuery.fetchStatus === "fetching" && Boolean(activeRunId),
    error: recentRunsQuery.error ?? activeRunQuery.error ?? createRenderRunMutation.error,
    createRenderRun: createRenderRunMutation.mutate,
    isCreatingRenderRun: createRenderRunMutation.isPending,
  };
}
