"use client";

import {
  Check,
  Clipboard,
  FileText,
  FlaskConical,
  Play,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
} from "@/lib/tours/rendering/spend/provider-spend";
import { formatTourRenderInvestigationExport } from "@/lib/tours/rendering/devtools/investigation-export";
import type { TourRenderRunStatusResponse } from "@/lib/tours/rendering/contracts/render.contract";
import {
  TOUR_RENDER_MODE_LABELS,
  TOUR_RENDER_MODES,
  TOUR_RENDER_PRESET_LABELS,
  TOUR_RENDER_PRESETS,
  TOUR_RENDER_REUSE_FLAG_LABELS,
  TOUR_RENDER_REUSE_FLAGS,
  TOUR_RENDER_SCENE_CLIP_MODEL_OPTIONS,
  TOUR_RENDER_SCRIPT_PLANNING_MODEL_OPTIONS,
  buildTourRenderOptionsFromAdvancedControls,
  getAdvancedControlsStateForPreset,
  type TourRenderPreset,
  type TourRenderAdvancedControlsState,
  type SupportedReuseFlag,
} from "@/lib/tours/rendering/options/render-options";
import {
  buildTourRenderImageToVideoPromptPreview,
  buildTourRenderScriptPlannerPromptPreview,
  type TourRenderPromptPreview,
  type TourRenderPromptPreviewProject,
} from "@/lib/tours/rendering/devtools/prompt-previews";
import type {
  TourRenderMode,
  TourRenderOptions,
} from "@/lib/tours/rendering/preflight/preflight";
import {
  RESOLVED_SCENE_TRANSITION_EFFECT_OPTIONS,
  getSceneTransitionEffectLabel,
  isResolvedSceneTransitionEffect,
} from "@/lib/tours/rendering/transitions/scene-transition-effects";
import type { TourProjectType } from "@/lib/tours/projects/project-types";

const BACKEND_DEFAULT_MODEL_VALUE = "__backend_default";

type QaRenderLabSection = "prompts" | "render" | "reuse" | "runCost" | "debug";
type TourRenderPresetSelection = TourRenderPreset | "custom";

const QA_RENDER_LAB_SECTIONS: Array<{
  id: QaRenderLabSection;
  label: string;
}> = [
  { id: "prompts", label: "Prompts" },
  { id: "render", label: "Render" },
  { id: "reuse", label: "Reuse" },
  { id: "runCost", label: "Run cost" },
  { id: "debug", label: "Debug packet" },
];

const RISK_BADGE_CLASSES: Record<TourProviderSpendRisk, string> = {
  low: "border-emerald-400/60 bg-emerald-400/10 text-emerald-200",
  moderate: "border-amber-400/60 bg-amber-400/10 text-amber-200",
  high: "border-red-400/60 bg-red-400/10 text-red-200",
};

export function TourProjectQaRenderLabPanel({
  isAvailable,
  includedSceneCount,
  tourType,
  initialOpen = false,
  isSubmitting = false,
  promptPreviewProject = null,
  getPromptPreviewProject,
  currentRun = null,
  onSubmitOptions,
}: {
  isAvailable: boolean;
  includedSceneCount: number;
  tourType: TourProjectType;
  initialOpen?: boolean;
  isSubmitting?: boolean;
  promptPreviewProject?: TourRenderPromptPreviewProject | null;
  getPromptPreviewProject?: () => TourRenderPromptPreviewProject | null;
  currentRun?: TourRenderRunStatusResponse | null;
  onSubmitOptions?: (options: TourRenderOptions) => void;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [activePromptPreview, setActivePromptPreview] =
    useState<TourRenderPromptPreview | null>(null);
  const [selectedPreset, setSelectedPreset] =
    useState<TourRenderPresetSelection>("reuse_everything_possible");
  const [controls, setControls] = useState<TourRenderAdvancedControlsState>(
    () => getAdvancedControlsStateForPreset("reuse_everything_possible"),
  );
  const [activeSection, setActiveSection] =
    useState<QaRenderLabSection>("reuse");
  const [isCustom, setIsCustom] = useState(false);
  const currentOptions = buildTourRenderOptionsFromAdvancedControls(controls);
  const spendEstimate = estimateTourProviderSpend({
    includedSceneCount,
    tourType,
    options: currentOptions,
  });
  const currentRunSpendEstimate = currentRun
    ? estimateTourProviderSpend({
        includedSceneCount,
        tourType,
        options: currentRun.options as TourRenderOptions,
      })
    : null;
  const investigationExport =
    currentRun && currentRunSpendEstimate
      ? formatTourRenderInvestigationExport({
          projectId: currentRun.projectId,
          run: currentRun,
          providerSpendEstimate: currentRunSpendEstimate,
        })
      : null;
  const hasDebugPacket = Boolean(
    currentRun && currentRunSpendEstimate && investigationExport,
  );
  const getPromptPreviewProjectForAction = () =>
    getPromptPreviewProject?.() ?? promptPreviewProject;
  const openScriptPlannerPromptPreview = () => {
    setActivePromptPreview(
      buildTourRenderScriptPlannerPromptPreview({
        project: getPromptPreviewProjectForAction(),
        options: currentOptions,
      }),
    );
  };
  const openImageToVideoPromptPreview = () => {
    setActivePromptPreview(
      buildTourRenderImageToVideoPromptPreview({
        project: getPromptPreviewProjectForAction(),
        options: currentOptions,
      }),
    );
  };

  const handlePresetChange = (preset: TourRenderPresetSelection) => {
    setSelectedPreset(preset);
    if (preset === "custom") {
      setIsCustom(true);
      return;
    }

    setControls(getAdvancedControlsStateForPreset(preset));
    setIsCustom(false);
  };

  const updateControls = (
    updater: (
      current: TourRenderAdvancedControlsState,
    ) => TourRenderAdvancedControlsState,
  ) => {
    setControls(updater);
    setSelectedPreset("custom");
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

  const copyInvestigationExport = async () => {
    if (!investigationExport) {
      return;
    }

    try {
      await navigator.clipboard.writeText(investigationExport);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
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
          className="flex max-h-[50vh] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border-2 border-dotted border-yellow-400/80 bg-neutral-950 p-4 text-neutral-100 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-yellow-300">
                Preview/dev only
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">QA Render Lab</h2>
                {isCustom ? (
                  <span className="rounded-sm border border-yellow-400/50 bg-yellow-400/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-100">
                    Custom
                  </span>
                ) : null}
              </div>
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
          <p className="mt-3 text-sm text-neutral-300">
            Tour Project QA surface is active for this workspace.
          </p>
          <div className="mt-4 grid min-h-0 flex-1 grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
            <div
              role="tablist"
              aria-label="QA Render Lab sections"
              aria-orientation="vertical"
              className="space-y-1"
            >
              {QA_RENDER_LAB_SECTIONS.map((section) => {
                const isActive = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    id={`tour-project-qa-render-lab-${section.id}-tab`}
                    aria-controls={`tour-project-qa-render-lab-${section.id}-panel`}
                    aria-selected={isActive}
                    className={
                      isActive
                        ? "w-full rounded-sm border border-yellow-400/70 bg-yellow-400/10 px-2 py-2 text-left text-xs font-semibold text-yellow-100"
                        : "w-full rounded-sm border border-transparent px-2 py-2 text-left text-xs font-medium text-neutral-300 hover:border-yellow-400/40 hover:bg-neutral-900 hover:text-neutral-100"
                    }
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.label}
                  </button>
                );
              })}
            </div>

            <div
              id={`tour-project-qa-render-lab-${activeSection}-panel`}
              role="tabpanel"
              aria-labelledby={`tour-project-qa-render-lab-${activeSection}-tab`}
              className="min-h-0 overflow-y-auto pr-1"
            >
              {activeSection === "prompts" ? (
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={openScriptPlannerPromptPreview}
                  >
                    <FileText className="h-4 w-4" />
                    View Script Planner Prompt
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={openImageToVideoPromptPreview}
                  >
                    <FileText className="h-4 w-4" />
                    View Image to Video Prompt
                  </Button>
                </div>
              ) : null}

              {activeSection === "render" ? (
                <div className="space-y-3">
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
                        className="h-9 bg-neutral-950/80"
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
                        ? "space-y-1.5 rounded-sm border border-yellow-400/60 bg-yellow-400/10 p-2"
                        : "space-y-1.5 rounded-sm border border-dashed border-neutral-700 bg-neutral-950/60 p-2 opacity-70"
                    }
                  >
                    <label
                      className="text-xs font-medium"
                      htmlFor="tour-scene-clip-provider-model-id"
                    >
                      Provider scene clip model id
                    </label>
                    <Select
                      value={
                        controls.sceneClipProviderModelId ||
                        BACKEND_DEFAULT_MODEL_VALUE
                      }
                      onValueChange={(value) =>
                        updateControls((current) => ({
                          ...current,
                          sceneClipProviderModelId:
                            value === BACKEND_DEFAULT_MODEL_VALUE ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger
                        id="tour-scene-clip-provider-model-id"
                        aria-label="Provider scene clip model id"
                        className="h-9 bg-neutral-950/80"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BACKEND_DEFAULT_MODEL_VALUE}>
                          Backend default
                        </SelectItem>
                        {TOUR_RENDER_SCENE_CLIP_MODEL_OPTIONS.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label} ({model.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-neutral-300">
                      Applies to provider_image_to_video runs. Leave blank to
                      omit.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      htmlFor="tour-script-planning-model-id"
                    >
                      Script planning model id
                    </label>
                    <Select
                      value={
                        controls.scriptPlanningModelId ||
                        BACKEND_DEFAULT_MODEL_VALUE
                      }
                      onValueChange={(value) =>
                        updateControls((current) => ({
                          ...current,
                          scriptPlanningModelId:
                            value === BACKEND_DEFAULT_MODEL_VALUE ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger
                        id="tour-script-planning-model-id"
                        aria-label="Script planning model id"
                        className="h-9 bg-neutral-950/80"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BACKEND_DEFAULT_MODEL_VALUE}>
                          Backend default
                        </SelectItem>
                        {TOUR_RENDER_SCRIPT_PLANNING_MODEL_OPTIONS.map(
                          (model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label} ({model.id})
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      htmlFor="tour-scene-transition-effect"
                    >
                      Scene transition
                    </label>
                    <Select
                      value={controls.sceneTransitionEffect}
                      onValueChange={(value) => {
                        if (!isResolvedSceneTransitionEffect(value)) {
                          return;
                        }
                        updateControls((current) => ({
                          ...current,
                          sceneTransitionEffect: value,
                        }));
                      }}
                    >
                      <SelectTrigger
                        id="tour-scene-transition-effect"
                        aria-label="Scene transition"
                        className="h-9 bg-neutral-950/80"
                      >
                        <SelectValue>
                          {getSceneTransitionEffectLabel(
                            controls.sceneTransitionEffect,
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {RESOLVED_SCENE_TRANSITION_EFFECT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label} ({option.value})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              {activeSection === "reuse" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      htmlFor="tour-render-preset"
                    >
                      Preset
                    </label>
                    <Select
                      value={selectedPreset}
                      onValueChange={(value) =>
                        handlePresetChange(value as TourRenderPresetSelection)
                      }
                    >
                      <SelectTrigger
                        id="tour-render-preset"
                        aria-label="Render preset"
                        className="h-9 bg-neutral-950/80"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom</SelectItem>
                        {TOUR_RENDER_PRESETS.map((preset) => (
                          <SelectItem key={preset} value={preset}>
                            {TOUR_RENDER_PRESET_LABELS[preset]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium">
                      Reuse generated assets
                    </p>
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
                              <p className="text-[11px] text-neutral-300">
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
                              onClick={() =>
                                updateReuseFlag(flag, !shouldReuse)
                              }
                            >
                              {shouldReuse ? "Reuse" : "Regen"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeSection === "runCost" ? (
                <ProviderSpendSummary estimate={spendEstimate} />
              ) : null}

              {activeSection === "debug" ? (
                hasDebugPacket &&
                currentRun &&
                currentRunSpendEstimate &&
                investigationExport ? (
                  <RunInvestigationDetails
                    run={currentRun}
                    exportText={investigationExport}
                    estimate={currentRunSpendEstimate}
                    copyState={copyState}
                    onCopy={copyInvestigationExport}
                  />
                ) : (
                  <div className="rounded-sm border border-dashed border-yellow-400/60 bg-yellow-400/10 p-3 text-xs text-yellow-100">
                    No debug packet is available until a render lab run exists.
                  </div>
                )
              ) : null}
            </div>
          </div>

          <div className="mt-3 border-t border-dashed border-yellow-300 pt-3">
            <Button
              type="button"
              size="sm"
              className="w-full border border-yellow-400/70 bg-yellow-400/15 text-yellow-100 hover:bg-yellow-400/25 disabled:border-yellow-400/45 disabled:bg-yellow-400/10 disabled:text-yellow-200 disabled:opacity-100 disabled:[&_svg]:text-yellow-200 dark:text-yellow-100 dark:disabled:text-yellow-200"
              disabled={!onSubmitOptions || isSubmitting}
              onClick={() => onSubmitOptions?.(currentOptions)}
            >
              <Play className="h-4 w-4" />
              {isSubmitting ? "Generating lab video..." : "Generate lab video"}
            </Button>
          </div>
        </section>
      ) : null}

      {activePromptPreview ? (
        <PromptPreviewDialog
          preview={activePromptPreview}
          onClose={() => setActivePromptPreview(null)}
        />
      ) : null}

      <Button
        type="button"
        size="sm"
        className="border-2 border-dotted border-yellow-400 bg-neutral-950 text-yellow-100 shadow-lg hover:bg-neutral-900 [&_svg]:text-yellow-100 [&>span]:text-yellow-100 dark:text-yellow-100"
        aria-expanded={isOpen}
        aria-controls={isOpen ? "tour-project-qa-render-lab-panel" : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <FlaskConical className="h-4 w-4" />
        <span>QA Render Lab</span>
        <span className="ml-1 rounded-sm border border-yellow-400/50 bg-yellow-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-yellow-100">
          {formatTourProviderSpendUsd(spendEstimate.estimatedTotalUsd)} est,
          {` ${spendEstimate.risk}`}
        </span>
      </Button>
    </div>
  );
}

function PromptPreviewDialog({
  preview,
  onClose,
}: {
  preview: TourRenderPromptPreview;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={preview.title}
        className="max-h-[min(42rem,calc(100vh-2rem))] w-[min(48rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-yellow-400/70 bg-neutral-950 text-neutral-100 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-yellow-300">
              Prompt preview
            </p>
            <h3 className="mt-1 text-sm font-semibold">{preview.title}</h3>
            {preview.available ? (
              <p className="mt-1 text-xs text-neutral-300">
                {preview.description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Close prompt preview"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[calc(min(42rem,100vh-2rem)-5.5rem)] overflow-y-auto p-4">
          {preview.available ? (
            <div className="space-y-4">
              {preview.sections.map((section) => (
                <section key={section.label} className="space-y-1.5">
                  <h4 className="text-xs font-semibold">{section.label}</h4>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-sm border border-neutral-700 bg-neutral-950/80 p-3 text-xs leading-relaxed text-neutral-100">
                    {section.content}
                  </pre>
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-sm border border-dashed border-yellow-400/60 bg-yellow-400/10 p-4 text-sm text-yellow-100">
              {preview.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProviderSpendSummary({
  estimate,
}: {
  estimate: TourProviderSpendEstimate;
}) {
  return (
    <div className="mt-3 rounded-sm border border-yellow-400/60 bg-neutral-950/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-yellow-100">
            Provider spend estimate
          </p>
          <p className="mt-0.5 text-sm font-semibold text-yellow-100">
            {formatTourProviderSpendUsd(estimate.estimatedTotalUsd)}
          </p>
        </div>
        <span
          className={`rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${RISK_BADGE_CLASSES[estimate.risk]}`}
        >
          {estimate.riskLabel}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-yellow-200">
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

function RunInvestigationDetails({
  run,
  exportText,
  estimate,
  copyState,
  onCopy,
}: {
  run: TourRenderRunStatusResponse;
  exportText: string;
  estimate: TourProviderSpendEstimate;
  copyState: "idle" | "copied" | "failed";
  onCopy: () => void;
}) {
  return (
    <div className="mt-3 rounded-sm border border-yellow-400/60 bg-neutral-950/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-neutral-100">
            Run investigation
          </p>
          <p className="mt-0.5 break-all text-[11px] text-neutral-300">
            Run {run.id}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={onCopy}
        >
          {copyState === "copied" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Clipboard className="h-4 w-4" />
          )}
          {copyState === "copied" ? "Copied" : "Copy packet"}
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <dt className="font-medium text-neutral-300">Project id</dt>
          <dd className="break-all text-neutral-100">{run.projectId}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <dt className="font-medium text-neutral-300">Trigger.dev run</dt>
          <dd className="break-all text-neutral-100">
            {run.triggerRunId ?? "Not available"}
          </dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <dt className="font-medium text-neutral-300">Status</dt>
          <dd className="text-neutral-100">{run.status}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <dt className="font-medium text-neutral-300">Current step</dt>
          <dd className="text-neutral-100">
            {run.step}
            {run.label ? ` (${run.label})` : ""}
          </dd>
        </div>
        {run.error?.message ? (
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <dt className="font-medium text-neutral-300">Error</dt>
            <dd className="text-red-300">{run.error.message}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-[11px] text-neutral-300">
        {estimate.summary}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-medium text-neutral-100">
          Submitted/effective options
        </summary>
        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-sm border border-neutral-700 bg-neutral-950/80 p-2 text-[11px] leading-relaxed text-neutral-100">
          {JSON.stringify(run.options, null, 2)}
        </pre>
      </details>
      <label className="mt-3 block text-[11px] font-medium text-neutral-100">
        Copyable packet
      </label>
      <textarea
        className="mt-1 h-28 w-full resize-none rounded-sm border border-neutral-700 bg-neutral-950/80 p-2 text-[11px] leading-relaxed text-neutral-100"
        readOnly
        value={exportText}
        aria-label="Copyable render investigation packet"
      />
      {copyState === "failed" ? (
        <p className="mt-1 text-[11px] text-red-300">
          Browser blocked clipboard access.
        </p>
      ) : null}
    </div>
  );
}

function ProviderSpendLineItem({ item }: { item: TourProviderSpendLineItem }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-sm border border-yellow-400/40 bg-neutral-950/70 px-2 py-1.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-100">
          {item.provider}: {item.label}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-neutral-300">
          {item.reason}
        </p>
      </div>
      <p className="text-xs font-semibold text-neutral-100">
        {formatTourProviderSpendUsd(item.estimatedCostUsd)}
      </p>
    </div>
  );
}
