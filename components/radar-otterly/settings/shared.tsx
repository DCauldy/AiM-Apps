"use client";

import { AlertCircle, ExternalLink } from "lucide-react";

import type { SettingsStatus } from "./types";

// Shared shell pieces — Skeleton, GateState, status-title mapper.

export function statusTitle(status: SettingsStatus): string {
  switch (status) {
    case "no_active_profile":
      return "Set up a profile first";
    case "no_website_url":
      return "Add your website URL";
    case "no_matching_report":
      return "Tracking isn't set up yet";
    case "otterly_error":
      return "Settings are temporarily unavailable";
    default:
      return "";
  }
}

export function SettingsSkeleton() {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-10 w-64 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
        <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
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
            {String(body).startsWith("Couldn't") ? (
              <AlertCircle className="h-6 w-6" />
            ) : (
              <ExternalLink className="h-6 w-6" />
            )}
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
