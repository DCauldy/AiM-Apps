"use client";

import { ExternalLink } from "lucide-react";

// Shared shell pieces — Skeleton, GateState.

export function OptimizeSkeleton() {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-44 bg-card border border-border rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
          <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
          <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function GateState({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ExternalLink className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
