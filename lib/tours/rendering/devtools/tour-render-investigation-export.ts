import type { TourRenderRunStatusResponse } from "../contracts/tour-render.contract";
import {
  formatTourProviderSpendUsd,
  type TourProviderSpendEstimate,
} from "../spend/tour-render-provider-spend";

export type TourRenderInvestigationExportInput = {
  projectId: string;
  run: Pick<
    TourRenderRunStatusResponse,
    | "id"
    | "status"
    | "step"
    | "label"
    | "triggerRunId"
    | "error"
    | "result"
    | "options"
  >;
  providerSpendEstimate: TourProviderSpendEstimate;
};

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatProviderSpendEstimate(estimate: TourProviderSpendEstimate) {
  const lines = [
    `${estimate.summary}`,
    `Included scenes: ${estimate.assumptions.includedSceneCount}`,
    `Render mode: ${estimate.assumptions.renderMode}`,
  ];

  if (estimate.assumptions.sceneClipProviderModelId) {
    lines.push(
      `Scene clip provider model: ${estimate.assumptions.sceneClipProviderModelId}`,
    );
  }

  lines.push(
    ...estimate.lineItems.map(
      (item) =>
        `- ${item.provider} ${item.label}: ${formatTourProviderSpendUsd(
          item.estimatedCostUsd,
        )} - ${item.reason}`,
    ),
  );

  return lines.join("\n");
}

export function formatTourRenderInvestigationExport({
  projectId,
  run,
  providerSpendEstimate,
}: TourRenderInvestigationExportInput) {
  const triggerRunId = run.triggerRunId?.trim() || "Not available";
  const currentStep = run.label ? `${run.step} (${run.label})` : run.step;
  const errorMessage = run.error?.message?.trim() || "None";
  const resultAssetId = run.result?.assetId ?? "None";

  return [
    "## Tour Render Run Investigation",
    "",
    `- Project id: ${projectId}`,
    `- Render run id: ${run.id}`,
    `- Parent Trigger.dev run id: ${triggerRunId}`,
    `- Status: ${run.status}`,
    `- Current step: ${currentStep}`,
    `- Error message: ${errorMessage}`,
    `- Result asset id: ${resultAssetId}`,
    "",
    "### Submitted/effective render options",
    "",
    "```json",
    formatJson(run.options),
    "```",
    "",
    "### Provider-spend estimate",
    "",
    formatProviderSpendEstimate(providerSpendEstimate),
  ].join("\n");
}
