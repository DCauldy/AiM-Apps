"use client";

import { FlaskConical, Play, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatTourProviderSpendUsd,
  estimateTourProviderSpend,
  type TourProviderSpendEstimate,
  type TourProviderSpendLineItem,
  type TourProviderSpendRisk,
} from "@/lib/tours/rendering/tour-render-provider-spend";
import {
  TOUR_RENDER_MODE_LABELS,
  TOUR_RENDER_MODES,
  TOUR_RENDER_PRESET_LABELS,
  TOUR_RENDER_PRESETS,
  TOUR_RENDER_REUSE_FLAG_LABELS,
  TOUR_RENDER_REUSE_FLAGS,
  buildTourRenderOptionsFromAdvancedControls,
  getAdvancedControlsStateForPreset,
  type TourRenderPreset,
  type TourRenderAdvancedControlsState,
  type SupportedReuseFlag,
} from "@/lib/tours/rendering/tour-render-options";
import type {
  TourRenderMode,
  TourRenderOptions,
} from "@/lib/tours/rendering/tour-render-preflight";
import type { TourProjectType } from "@/lib/tours/project-types";

const RISK_BADGE_CLASSES: Record<TourProviderSpendRisk, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
  moderate: "border-amber-200 bg-amber-50 text-amber-900",
  high: "border-red-200 bg-red-50 text-red-800",
};

export function TourProjectQaRenderLab({
  isAvailable,
  includedSceneCount,
  tourType,
  isSubmitting = false,
  onSubmitOptions,
}: {
  isAvailable: boolean;
  includedSceneCount: number;
  tourType: TourProjectType;
  isSubmitting?: boolean;
  onSubmitOptions?: (options: TourRenderOptions) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<TourRenderPreset>(
    "reuse_everything_possible",
  );
  const [controls, setControls] = useState<TourRenderAdvancedControlsState>(
    () => getAdvancedControlsStateForPreset("reuse_everything_possible"),
  );
  const [isCustom, setIsCustom] = useState(false);
  const currentOptions = buildTourRenderOptionsFromAdvancedControls(controls);
  const spendEstimate = estimateTourProviderSpend({
    includedSceneCount,
    tourType,
    options: currentOptions,
  });

  const handlePresetChange = (preset: TourRenderPreset) => {
    setSelectedPreset(preset);
    setControls(getAdvancedControlsStateForPreset(preset));
    setIsCustom(false);
  };

  const updateControls = (
    updater: (
      current: TourRenderAdvancedControlsState,
    ) => TourRenderAdvancedControlsState,
  ) => {
    setControls(updater);
    setIsCustom(true);
  };

  const updateReuseFlag = (flag: SupportedReuseFlag, shouldReuse: boolean) => {
    updateControls((current) => ({
      ...current,
      reuse: {
        ...current.reuse,
        [flag]: shouldReuse,
      },
    }));
  };

  if (!isAvailable) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:bottom-6 sm:right-6"
      data-testid="tour-project-qa-render-lab"
    >
      {isOpen ? (
        <section
          id="tour-project-qa-render-lab-panel"
          aria-label="QA Render Lab"
          className="w-[min(22rem,calc(100vw-2rem))] rounded-md border-2 border-dotted border-yellow-400 bg-background p-4 text-foreground shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-yellow-700">
                Preview/dev only
              </p>
              <h2 className="mt-1 text-sm font-semibold">QA Render Lab</h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Close QA Render Lab"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Tour Project QA surface is active for this workspace.
          </p>
          <ProviderSpendSummary estimate={spendEstimate} />
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <label
                  className="text-xs font-medium"
                  htmlFor="tour-render-preset"
                >
                  Preset
                </label>
                {isCustom ? (
                  <span className="rounded-sm bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-900">
                    Custom
                  </span>
                ) : null}
              </div>
              <Select
                value={selectedPreset}
                onValueChange={(value) =>
                  handlePresetChange(value as TourRenderPreset)
                }
              >
                <SelectTrigger
                  id="tour-render-preset"
                  aria-label="Render preset"
                  className="h-9 bg-background"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOUR_RENDER_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {TOUR_RENDER_PRESET_LABELS[preset]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 border-t border-dashed border-yellow-300 pt-3">
              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium"
                  htmlFor="tour-render-mode"
                >
                  Render mode
                </label>
                <Select
                  value={controls.renderMode}
                  onValueChange={(value) =>
                    updateControls((current) => ({
                      ...current,
                      renderMode: value as TourRenderMode,
                    }))
                  }
                >
                  <SelectTrigger
                    id="tour-render-mode"
                    aria-label="Render mode"
                    className="h-9 bg-background"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOUR_RENDER_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {TOUR_RENDER_MODE_LABELS[mode]} ({mode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={
                  controls.renderMode === "provider_image_to_video"
                    ? "space-y-1.5 rounded-sm border border-yellow-300 bg-yellow-50/70 p-2"
                    : "space-y-1.5 rounded-sm border border-dashed border-muted p-2 opacity-70"
                }
              >
                <label
                  className="text-xs font-medium"
                  htmlFor="tour-scene-clip-provider-model-id"
                >
                  Provider scene clip model id
                </label>
                <Input
                  id="tour-scene-clip-provider-model-id"
                  aria-label="Provider scene clip model id"
                  value={controls.sceneClipProviderModelId}
                  placeholder="Use backend default"
                  onChange={(event) =>
                    updateControls((current) => ({
                      ...current,
                      sceneClipProviderModelId: event.target.value,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Applies to provider_image_to_video runs. Leave blank to omit.
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium"
                  htmlFor="tour-script-planning-model-id"
                >
                  Script planning model id
                </label>
                <Input
                  id="tour-script-planning-model-id"
                  aria-label="Script planning model id"
                  value={controls.scriptPlanningModelId}
                  placeholder="Use backend default"
                  onChange={(event) =>
                    updateControls((current) => ({
                      ...current,
                      scriptPlanningModelId: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium">Reuse generated assets</p>
                <div className="space-y-1.5">
                  {TOUR_RENDER_REUSE_FLAGS.map((flag) => {
                    const shouldReuse = controls.reuse[flag];
                    return (
                      <div
                        key={flag}
                        className="flex items-center justify-between gap-3 rounded-sm border border-border px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium">
                            {TOUR_RENDER_REUSE_FLAG_LABELS[flag]}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {shouldReuse
                              ? "Reuse this asset"
                              : "Regenerate this asset"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant={shouldReuse ? "default" : "outline"}
                          size="sm"
                          role="switch"
                          aria-checked={shouldReuse}
                          aria-label={`${TOUR_RENDER_REUSE_FLAG_LABELS[flag]} reuse`}
                          className="h-7 w-20 shrink-0"
                          onClick={() => updateReuseFlag(flag, !shouldReuse)}
                        >
                          {shouldReuse ? "Reuse" : "Regen"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              className="w-full bg-yellow-400 text-yellow-950 hover:bg-yellow-300"
              disabled={!onSubmitOptions || isSubmitting}
              onClick={() => onSubmitOptions?.(currentOptions)}
            >
              <Play className="h-4 w-4" />
              {isSubmitting ? "Starting run..." : "Start render lab run"}
            </Button>
          </div>
        </section>
      ) : null}

      <Button
        type="button"
        size="sm"
        className="border-2 border-dotted border-yellow-400 bg-yellow-400 text-yellow-950 shadow-lg hover:bg-yellow-300"
        aria-expanded={isOpen}
        aria-controls={isOpen ? "tour-project-qa-render-lab-panel" : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <FlaskConical className="h-4 w-4" />
        <span>QA Render Lab</span>
        <span className="ml-1 rounded-sm bg-yellow-100 px-1.5 py-0.5 text-[11px] font-semibold text-yellow-950">
          {formatTourProviderSpendUsd(spendEstimate.estimatedTotalUsd)} est,
          {` ${spendEstimate.risk}`}
        </span>
      </Button>
    </div>
  );
}

function ProviderSpendSummary({
  estimate,
}: {
  estimate: TourProviderSpendEstimate;
}) {
  return (
    <div className="mt-3 rounded-sm border border-yellow-300 bg-yellow-50/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-yellow-950">
            Provider spend estimate
          </p>
          <p className="mt-0.5 text-sm font-semibold text-yellow-950">
            {formatTourProviderSpendUsd(estimate.estimatedTotalUsd)}
          </p>
        </div>
        <span
          className={`rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${RISK_BADGE_CLASSES[estimate.risk]}`}
        >
          {estimate.riskLabel}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-yellow-900">
        Estimate uses {estimate.assumptions.includedSceneCount} included scene
        {estimate.assumptions.includedSceneCount === 1 ? "" : "s"} at{" "}
        {estimate.assumptions.clipSeconds}s per clip.
      </p>
      <div className="mt-3 space-y-2">
        {estimate.lineItems.map((item) => (
          <ProviderSpendLineItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function ProviderSpendLineItem({ item }: { item: TourProviderSpendLineItem }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-sm border border-yellow-200 bg-background/80 px-2 py-1.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">
          {item.provider}: {item.label}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {item.reason}
        </p>
      </div>
      <p className="text-xs font-semibold text-foreground">
        {formatTourProviderSpendUsd(item.estimatedCostUsd)}
      </p>
    </div>
  );
}
