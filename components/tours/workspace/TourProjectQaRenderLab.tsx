"use client";

import { FlaskConical, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function TourProjectQaRenderLab({
  isAvailable,
}: {
  isAvailable: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

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
          <div className="mt-4 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-medium text-yellow-900">
            Internal preview controls only
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
