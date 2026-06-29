"use client";

import { FlaskConical } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TourRenderRunStatusResponse } from "@/lib/tours/rendering/contracts/render.contract";
import type { TourRenderPromptPreviewProject } from "@/lib/tours/rendering/devtools/prompt-previews";
import type { TourRenderOptions } from "@/lib/tours/rendering/preflight/preflight";
import type { TourProjectType } from "@/lib/tours/projects/project-types";

const TourProjectQaRenderLabPanel = lazy(() =>
  import("./TourProjectQaRenderLabPanel").then((module) => ({
    default: module.TourProjectQaRenderLabPanel,
  })),
);

export type TourRenderPromptPreviewProjectBuilder =
  () => TourRenderPromptPreviewProject | null;

export function TourProjectQaRenderLab({
  isAvailable,
  includedSceneCount,
  tourType,
  isSubmitting = false,
  promptPreviewProject = null,
  getPromptPreviewProject,
  currentRun = null,
  onSubmitOptions,
}: {
  isAvailable: boolean;
  includedSceneCount: number;
  tourType: TourProjectType;
  isSubmitting?: boolean;
  promptPreviewProject?: TourRenderPromptPreviewProject | null;
  getPromptPreviewProject?: TourRenderPromptPreviewProjectBuilder;
  currentRun?: TourRenderRunStatusResponse | null;
  onSubmitOptions?: (options: TourRenderOptions) => void;
}) {
  const [hasOpened, setHasOpened] = useState(false);

  if (!isAvailable) {
    return null;
  }

  if (hasOpened) {
    return (
      <Suspense fallback={<TourProjectQaRenderLabLauncher isLoading />}>
        <TourProjectQaRenderLabPanel
          initialOpen
          isAvailable={isAvailable}
          includedSceneCount={includedSceneCount}
          tourType={tourType}
          isSubmitting={isSubmitting}
          promptPreviewProject={promptPreviewProject}
          getPromptPreviewProject={getPromptPreviewProject}
          currentRun={currentRun}
          onSubmitOptions={onSubmitOptions}
        />
      </Suspense>
    );
  }

  return <TourProjectQaRenderLabLauncher onOpen={() => setHasOpened(true)} />;
}

function TourProjectQaRenderLabLauncher({
  isLoading = false,
  onOpen,
}: {
  isLoading?: boolean;
  onOpen?: () => void;
}) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:bottom-6 sm:right-6"
      data-testid="tour-project-qa-render-lab"
    >
      <Button
        type="button"
        size="sm"
        className="border-2 border-dotted border-yellow-400 bg-neutral-950 text-yellow-100 shadow-lg hover:bg-neutral-900 [&_svg]:text-yellow-100 [&>span]:text-yellow-100 dark:text-yellow-100"
        disabled={isLoading}
        aria-expanded={false}
        onClick={onOpen}
      >
        <FlaskConical className="h-4 w-4" />
        <span>{isLoading ? "Loading QA Render Lab..." : "QA Render Lab"}</span>
        <span className="ml-1 rounded-sm border border-yellow-400/50 bg-yellow-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-yellow-100">
          $0.00 est, low
        </span>
      </Button>
    </div>
  );
}
