"use client";

import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mirrors lib/hyperlocal/email/compliance.ts. Kept narrow on purpose —
// the client only renders the codes the API returns, and a new code
// surfacing here will just render the message without a fixit link.
export type ComplianceCode =
  | "missing_physical_address"
  | "missing_license_number"
  | "missing_brokerage"
  | "missing_supervising_broker"
  | "domain_not_verified"
  | "connection_paused"
  | "connection_inactive"
  | "no_unsubscribe_token";

export interface ComplianceIssue {
  code: ComplianceCode;
  message: string;
}

interface FixIt {
  href: string;
  label: string;
}

const FIX_BY_CODE: Partial<Record<ComplianceCode, FixIt>> = {
  missing_physical_address: { href: "/apps/profile", label: "Edit profile" },
  missing_license_number: { href: "/apps/profile", label: "Edit profile" },
  missing_brokerage: { href: "/apps/profile", label: "Edit profile" },
  missing_supervising_broker: { href: "/apps/profile", label: "Edit profile" },
  domain_not_verified: {
    href: "/apps/hyperlocal/settings?tab=email",
    label: "Open email settings",
  },
  connection_paused: {
    href: "/apps/hyperlocal/settings?tab=email",
    label: "Open email settings",
  },
  connection_inactive: {
    href: "/apps/hyperlocal/settings?tab=email",
    label: "Open email settings",
  },
  // no_unsubscribe_token has no actionable deep link — the user has to
  // regenerate the audience, which happens by re-running discovery.
  // We still surface the message so they know why we refused.
};

export function ComplianceFixItBanner({
  issues,
  onRetry,
  onDismiss,
  retrying,
}: {
  issues: ComplianceIssue[];
  onRetry: () => void;
  onDismiss: () => void;
  retrying?: boolean;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              This run can&apos;t be launched yet
            </p>
            <ul className="mt-2 space-y-1.5">
              {issues.map((issue, i) => {
                const fix = FIX_BY_CODE[issue.code];
                return (
                  <li
                    key={`${issue.code}-${i}`}
                    className="text-xs text-amber-900/90 dark:text-amber-100/90"
                  >
                    <span>• {issue.message}</span>
                    {fix && (
                      <>
                        {" "}
                        <Link
                          href={fix.href}
                          className="underline hover:no-underline font-medium"
                        >
                          {fix.label} →
                        </Link>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                disabled={retrying}
              >
                {retrying ? "Checking…" : "Try again"}
              </Button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-700/70 hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100 shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
