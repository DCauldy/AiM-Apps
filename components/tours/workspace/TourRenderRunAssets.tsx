"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TourRenderRunStatusResponse } from "@/lib/tours/rendering/contracts/tour-render.contract";
import type { TourRenderAsset } from "@/lib/tours/rendering/repositories/tour-render.repository.types";
import { Code, Download, File, Image, Music, Video } from "lucide-react";
import { useState } from "react";
import { useTourRenderRunAssets } from "./useTourRenderRunAssets";

const GENERATED_ASSET_RETENTION_DAYS = 30;

export function TourRenderRunAssets({
  run,
}: {
  run: TourRenderRunStatusResponse;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { runAssets, isLoadingRunAssets } = useTourRenderRunAssets(run.id);
  const assetCountLabel = `${runAssets.length} downloadable asset${runAssets.length === 1 ? "" : "s"}`;
  const hasDownloadableAssets = runAssets.length > 0;
  const retentionDateLabel = formatGeneratedAssetRetentionDate(run.updatedAt);
  const buttonLabel = hasDownloadableAssets
    ? `View ${assetCountLabel}`
    : "Assets expired for download";
  const retentionLabel = hasDownloadableAssets
    ? `Expires ${retentionDateLabel}`
    : `Expired ${retentionDateLabel}`;

  return (
    <div className="mt-5 overflow-hidden rounded-md bg-background shadow-sm">
      <Button
        variant="outline"
        onClick={() => {
          if (hasDownloadableAssets) {
            setIsOpen((isOpen) => !isOpen);
          }
        }}
        disabled={isLoadingRunAssets || !hasDownloadableAssets}
        className={cn(
          "flex min-h-16 w-full items-center justify-between gap-4 px-4 py-4 text-left",
          isOpen && !isLoadingRunAssets && "rounded-b-none",
        )}
      >
        <span className="min-w-0 truncate">
          {isLoadingRunAssets ? "Loading assets..." : isOpen ? "Close asset list" : buttonLabel}
        </span>
        {!isLoadingRunAssets ? (
          <span className="shrink-0 text-xs font-normal text-muted-foreground/70">
            {retentionLabel}
          </span>
        ) : null}
      </Button>
      {!isLoadingRunAssets && isOpen ? (
        <div className="mt-0 overflow-hidden rounded-md rounded-t-none border border-t-0 border-border bg-background pt-0 shadow-sm">
          {runAssets.length > 0 ? (
            runAssets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AssetIcon asset={asset} />
                  <p className="truncate text-sm font-medium text-foreground">
                    {asset.name}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                >
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    download
                    aria-label={`Download ${asset.name}`}
                    title={`Download ${asset.name}`}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No downloadable intermediate assets remain for this render.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatGeneratedAssetRetentionDate(updatedAt: string): string {
  const updatedAtTime = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedAtTime)) {
    return "after 30 days";
  }

  const retentionDate = new Date(
    updatedAtTime + GENERATED_ASSET_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(retentionDate);
}

const IS_VIDEO = (asset: TourRenderAsset) =>
  asset.contentType && ["video/mp4", "video/webm"].includes(asset.contentType);
const IS_IMAGE = (asset: TourRenderAsset) =>
  asset.contentType &&
  ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
    asset.contentType,
  );
const IS_AUDIO = (asset: TourRenderAsset) =>
  asset.contentType &&
  ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"].includes(
    asset.contentType,
  );
const IS_JSON = (asset: TourRenderAsset) =>
  asset.contentType && ["application/json"].includes(asset.contentType);

function AssetIcon({ asset }: { asset: TourRenderAsset }) {
  const iconClassName = "h-4 w-4";
  const frameClassName =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border";

  if (IS_IMAGE(asset)) {
    return (
      <span
        className={cn(
          frameClassName,
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
        )}
      >
        <Image className={iconClassName} />
      </span>
    );
  }
  if (IS_VIDEO(asset)) {
    return (
      <span
        className={cn(
          frameClassName,
          "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300",
        )}
      >
        <Video className={iconClassName} />
      </span>
    );
  }
  if (IS_AUDIO(asset)) {
    return (
      <span
        className={cn(
          frameClassName,
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
        )}
      >
        <Music className={iconClassName} />
      </span>
    );
  }
  if (IS_JSON(asset)) {
    return (
      <span
        className={cn(
          frameClassName,
          "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
        )}
      >
        <Code className={iconClassName} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        frameClassName,
        "border-border bg-muted/70 text-muted-foreground dark:bg-muted/40",
      )}
    >
      <File className={iconClassName} />
    </span>
  );
}
