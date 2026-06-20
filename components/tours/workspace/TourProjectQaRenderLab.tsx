"use client";

import { FlaskConical, Play, X } from "lucide-react";
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
  TOUR_RENDER_PRESET_LABELS,
  TOUR_RENDER_PRESETS,
  type TourRenderPreset,
} from "@/lib/tours/rendering/tour-render-options";

export function TourProjectQaRenderLab({
  isAvailable,
  isSubmitting = false,
  onSubmitPreset,
}: {
  isAvailable: boolean;
  isSubmitting?: boolean;
  onSubmitPreset?: (preset: TourRenderPreset) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<TourRenderPreset>(
    "reuse_everything_possible"
  );

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
          <div className="mt-4 space-y-3">
            <Select
              value={selectedPreset}
              onValueChange={(value) => setSelectedPreset(value as TourRenderPreset)}
            >
              <SelectTrigger aria-label="Render preset" className="h-9 bg-background">
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
            <Button
              type="button"
              size="sm"
              className="w-full bg-yellow-400 text-yellow-950 hover:bg-yellow-300"
              disabled={!onSubmitPreset || isSubmitting}
              onClick={() => onSubmitPreset?.(selectedPreset)}
            >
              <Play className="h-4 w-4" />
              {isSubmitting ? "Starting run..." : "Start preset run"}
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
        QA Render Lab
      </Button>
    </div>
  );
}
