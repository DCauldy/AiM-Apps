"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isTourRenderRunActive,
  type TourRenderRunsSummaryResponse,
  type TourRenderRunStatusResponse,
} from "@/lib/tours/rendering/contracts/render.contract";
import type { TourRenderOptions } from "@/lib/tours/rendering/preflight/preflight";
import {
  createRenderRun,
  fetchRecentRenderRuns,
  fetchRenderRunsSummary,
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
      (run) => run.status === "completed" && Boolean(run.result?.assetId),
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

type UseTourRenderRunsOptions = {
  loadRecentRuns?: boolean;
};

export function useTourRenderRuns(
  projectId: string,
  options: UseTourRenderRunsOptions = {},
) {
  const { loadRecentRuns = true } = options;
  const router = useRouter();
  const queryClient = useQueryClient();
  const recentRunsQueryKey = useMemo(
    () => tourQueryKeys.renderRuns(projectId),
    [projectId],
  );

  const recentRunsQuery = useQuery({
    queryKey: recentRunsQueryKey,
    queryFn: () => fetchRecentRenderRuns(projectId),
    enabled: loadRecentRuns,
    refetchOnWindowFocus: false,
  });

  const summaryQuery = useQuery({
    queryKey: tourQueryKeys.renderRunsSummary(projectId),
    queryFn: () => fetchRenderRunsSummary(projectId),
    enabled: !loadRecentRuns,
    refetchOnWindowFocus: true,
  });

  const recentRuns = recentRunsQuery.data ?? [];
  const displayRun = loadRecentRuns
    ? pickDisplayRun(recentRuns)
    : summaryQuery.data?.activeRun ?? null;
  const activeRunId =
    displayRun && isTourRenderRunActive(displayRun) ? displayRun.id : null;
  const latestDownloadableRun = loadRecentRuns
    ? pickLatestDownloadableRenderRun(recentRuns)
    : summaryQuery.data?.latestDownloadableRun ?? null;

  const activeRunStatusQuery = useQuery({
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
    const polledRun = activeRunStatusQuery.data;
    if (!polledRun) {
      return;
    }
    const isPolledRunActive = isTourRenderRunActive(polledRun);
    const isPolledRunDownloadable =
      polledRun.status === "completed" && Boolean(polledRun.result?.assetId);

    queryClient.setQueryData<TourRenderRunStatusResponse[]>(
      recentRunsQueryKey,
      (runs = []) => [
        polledRun,
        ...runs.filter((run) => run.id !== polledRun.id),
      ],
    );
    queryClient.setQueryData<TourRenderRunStatusResponse | null>(
      tourQueryKeys.activeRenderRun(projectId),
      isPolledRunActive ? polledRun : null,
    );
    queryClient.setQueryData(
      tourQueryKeys.renderRunsSummary(projectId),
      (summary: TourRenderRunsSummaryResponse | undefined) => ({
        activeRun: isPolledRunActive ? polledRun : null,
        latestDownloadableRun: isPolledRunDownloadable
          ? polledRun
          : summary?.latestDownloadableRun ?? null,
      }),
    );
  }, [activeRunStatusQuery.data, projectId, queryClient, recentRunsQueryKey]);

  const currentRun = activeRunStatusQuery.data ?? displayRun;
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
      queryClient.setQueryData<TourRenderRunStatusResponse | null>(
        tourQueryKeys.activeRenderRun(projectId),
        isTourRenderRunActive(run) ? run : null,
      );
      queryClient.setQueryData<TourRenderRunsSummaryResponse>(
        tourQueryKeys.renderRunsSummary(projectId),
        (summary) => ({
          activeRun: isTourRenderRunActive(run) ? run : null,
          latestDownloadableRun: summary?.latestDownloadableRun ?? null,
        }),
      );
      router.push(`/apps/tours/projects/${projectId}/rendering`);
    },
  });

  return {
    currentRun,
    recentRuns,
    latestDownloadableRun,
    isLoadingRecentRuns: recentRunsQuery.isLoading,
    isPollingActiveRun:
      activeRunStatusQuery.fetchStatus === "fetching" && Boolean(activeRunId),
    error:
      recentRunsQuery.error ??
      summaryQuery.error ??
      activeRunStatusQuery.error ??
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
