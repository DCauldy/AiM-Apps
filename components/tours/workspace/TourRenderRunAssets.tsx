"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TourRenderRunStatusResponse } from "@/lib/tours/rendering/tour-render.contract";
import type { TourRenderAsset } from "@/lib/tours/rendering/tour-render.repository.types";
import { Code, Download, File, Image, Music, Video } from "lucide-react";
import { useState } from "react";
import { useTourRenderRunAssets } from "./useTourRenderRunAssets";

export function TourRenderRunAssets({
  run,
}: {
  run: TourRenderRunStatusResponse;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { runAssets, isLoadingRunAssets } = useTourRenderRunAssets(run.id);
  return (
    <div className="mt-5 overflow-hidden rounded-md bg-background shadow-sm">
      <Button
        variant="outline"
        onClick={() => setIsOpen((isOpen) => !isOpen)}
        disabled={isLoadingRunAssets}
        className={cn(
          "w-full justify-start text-left py-8",
          isOpen && !isLoadingRunAssets && "rounded-b-none",
        )}
      >
        {isLoadingRunAssets
          ? "Loading Assets..."
          : isOpen
            ? `Close Asset list`
            : `View ${runAssets.length} asset${runAssets.length === 1 ? "" : "s"}`}
      </Button>
      {!isLoadingRunAssets && isOpen ? (
        <div className="mt-0 overflow-hidden rounded-md rounded-t-none border border-t-0 border-border bg-background pt-0 shadow-sm">
          {runAssets.map((asset) => (
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
          ))}
        </div>
      ) : null}
    </div>
  );
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
