"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTourRenderRunAssets, tourQueryKeys } from "@/components/tours/tours-api-client";

export function useTourRenderRunAssets(runId: string) {
  const runAssetsQuery = useQuery({
    queryKey: tourQueryKeys.renderRunAssets(runId),
    queryFn: () => fetchTourRenderRunAssets(runId),
    enabled: Boolean(runId),
    refetchOnWindowFocus: false,
  });

  return {
    runAssets: runAssetsQuery.data ?? [],
    isLoadingAssets: runAssetsQuery.isLoading,
    isLoadingRunAssets: runAssetsQuery.isLoading,
    error: runAssetsQuery.error,
  };
}
