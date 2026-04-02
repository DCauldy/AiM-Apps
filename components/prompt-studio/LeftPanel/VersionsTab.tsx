"use client";

import { Clock } from "lucide-react";

export interface PromptVersion {
  id: string;
  content: string;
  created_at: string;
  lazyPrompt?: string;
  context?: string;
}

interface VersionsTabProps {
  versions: PromptVersion[];
  activeVersionId: string | null;
  onSelectVersion: (version: PromptVersion) => void;
}

export function VersionsTab({
  versions,
  activeVersionId,
  onSelectVersion,
}: VersionsTabProps) {
  if (versions.length === 0) {
    return (
      <div className="px-3 py-8 flex flex-col items-center text-center gap-2">
        <Clock className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No versions yet</p>
        <p className="text-xs text-muted-foreground">
          Each time you improve your prompt, a new version is saved here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto max-h-[400px]">
      {versions.map((version, index) => {
        const isActive = version.id === activeVersionId;
        const date = new Date(version.created_at);
        const label = `Version ${versions.length - index}`;
        const timeStr = date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateStr = date.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });

        return (
          <button
            key={version.id}
            type="button"
            onClick={() => onSelectVersion(version)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              isActive
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-foreground">
                {label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {dateStr} · {timeStr}
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {version.content}
            </p>
          </button>
        );
      })}
    </div>
  );
}
