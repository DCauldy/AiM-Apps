"use client";

import { useQuery } from "@tanstack/react-query";
import type { TourRenderRunAssetResponse } from "@/lib/tours/rendering/tour-render.contract";

type RenderRunAssetsResponse = {
  assets: TourRenderRunAssetResponse[];
};

async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? fallbackError);
  }
  return payload as T;
}

async function fetchTourRenderRunAssets(runId: string): Promise<TourRenderRunAssetResponse[]> {
  const response = await fetch(`/api/apps/tours/render-runs/${runId}/assets`);
  const payload = await readJsonResponse<RenderRunAssetsResponse>(
    response,
    "Could not load render assets."
  );
  return payload.assets;
}

export function useTourRenderRunAssets(runId: string) {
  const runAssetsQuery = useQuery({
    queryKey: ["tours", "render-runs", runId, "assets"],
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
