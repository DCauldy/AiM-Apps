"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isTourRenderRunActive,
  type TourRenderRunStatusResponse,
} from "@/lib/tours/rendering/contracts/tour-render.contract";
import type { TourRenderOptions } from "@/lib/tours/rendering/preflight/tour-render-preflight";
import {
  createRenderRun,
  fetchRecentRenderRuns,
  fetchRenderRunStatus,
  FRESH_RENDER_OPTIONS,
  buildCreateRenderRunRequestBody,
  tourQueryKeys,
  type CreateRenderRunInput,
} from "@/components/tours/tours-api-client";

export { FRESH_RENDER_OPTIONS, buildCreateRenderRunRequestBody };

function pickDisplayRun(
  runs: TourRenderRunStatusResponse[],
): TourRenderRunStatusResponse | null {
  return runs.find(isTourRenderRunActive) ?? runs[0] ?? null;
}

export function pickLatestDownloadableRenderRun(
  runs: TourRenderRunStatusResponse[],
): TourRenderRunStatusResponse | null {
  return (
    runs.find(
      (run) => run.status === "completed" && Boolean(run.result?.downloadUrl),
    ) ?? null
  );
}

export function isPlainReuseRenderRunInput(input?: CreateRenderRunInput) {
  return !input?.fresh && !input?.options;
}

export function isFreshRenderRunInput(input?: CreateRenderRunInput) {
  return Boolean(input?.fresh);
}

export function isOptionsRenderRunInput(input?: CreateRenderRunInput) {
  return Boolean(input?.options) && !input?.fresh;
}

export function useTourRenderRuns(projectId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const recentRunsQueryKey = useMemo(
    () => tourQueryKeys.renderRuns(projectId),
    [projectId],
  );

  const recentRunsQuery = useQuery({
    queryKey: recentRunsQueryKey,
    queryFn: () => fetchRecentRenderRuns(projectId),
    refetchOnWindowFocus: false,
  });

  const recentRuns = recentRunsQuery.data ?? [];
  const displayRun = pickDisplayRun(recentRuns);
  const activeRunId =
    displayRun && isTourRenderRunActive(displayRun) ? displayRun.id : null;

  const activeRunQuery = useQuery({
    queryKey: tourQueryKeys.renderRunStatus(projectId, activeRunId),
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

    queryClient.setQueryData<TourRenderRunStatusResponse[]>(
      recentRunsQueryKey,
      (runs = []) => [
        activeRunQuery.data,
        ...runs.filter((run) => run.id !== activeRunQuery.data?.id),
      ],
    );
  }, [activeRunQuery.data, queryClient, recentRunsQueryKey]);

  const currentRun = activeRunQuery.data ?? displayRun;
  const createRenderRunMutation = useMutation({
    mutationFn: (input: CreateRenderRunInput = {}) =>
      createRenderRun(projectId, input),
    onSuccess: (run) => {
      queryClient.setQueryData<TourRenderRunStatusResponse[]>(
        recentRunsQueryKey,
        (runs = []) => [
          run,
          ...runs.filter((existingRun) => existingRun.id !== run.id),
        ],
      );
      router.push(`/apps/tours/projects/${projectId}/rendering`);
    },
  });

  return {
    currentRun,
    recentRuns,
    latestDownloadableRun: pickLatestDownloadableRenderRun(recentRuns),
    isLoadingRecentRuns: recentRunsQuery.isLoading,
    isPollingActiveRun:
      activeRunQuery.fetchStatus === "fetching" && Boolean(activeRunId),
    error:
      recentRunsQuery.error ??
      activeRunQuery.error ??
      createRenderRunMutation.error,
    createRenderRun: () => createRenderRunMutation.mutate({ fresh: false }),
    createFreshRenderRun: () => createRenderRunMutation.mutate({ fresh: true }),
    createOptionsRenderRun: (options: TourRenderOptions) =>
      createRenderRunMutation.mutate({
        fresh: false,
        options,
      }),
    isCreatingRenderRun:
      createRenderRunMutation.isPending &&
      isPlainReuseRenderRunInput(createRenderRunMutation.variables),
    isCreatingFreshRenderRun:
      createRenderRunMutation.isPending &&
      isFreshRenderRunInput(createRenderRunMutation.variables),
    isCreatingOptionsRenderRun:
      createRenderRunMutation.isPending &&
      isOptionsRenderRunInput(createRenderRunMutation.variables),
    isCreatingAnyRenderRun: createRenderRunMutation.isPending,
  };
}
