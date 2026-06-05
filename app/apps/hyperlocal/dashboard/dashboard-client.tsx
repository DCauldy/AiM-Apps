"use client";

import Link from "next/link";
import { Mail, Database, Inbox, Ban, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CRM_PLATFORM_LABELS, EMAIL_PROVIDER_LABELS, RUN_PHASE_LABELS } from "@/types/hyperlocal";
import type { CrmPlatform, EmailProvider, RunPhase } from "@/types/hyperlocal";

interface CrmConn {
  id: string;
  platform: CrmPlatform;
  label: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
}

interface EmailConn {
  id: string;
  provider: EmailProvider;
  email_address: string;
  display_name: string | null;
  is_default: boolean;
  is_active: boolean;
  last_send_at: string | null;
}

interface RecentRun {
  id: string;
  campaign_id: string | null;
  phase: RunPhase;
  contacts_fetched: number;
  emails_sent: number;
  emails_failed: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Campaign {
  id: string;
  name: string;
  segmentation: string;
  lens: string;
  is_active: boolean;
}

export function HyperlocalDashboardClient({
  crmConnections,
  emailConnections,
  recentRuns,
  suppressionCount,
  campaigns,
}: {
  crmConnections: CrmConn[];
  emailConnections: EmailConn[];
  recentRuns: RecentRun[];
  suppressionCount: number;
  campaigns: Campaign[];
}) {
  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hyperlocal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Neighborhood market-report email campaigns from your CRM + MLS data.
          </p>
        </div>
        <Link href="/apps/hyperlocal/campaigns">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          icon={<Database className="h-4 w-4" />}
          label="CRM connections"
          value={crmConnections.filter((c) => c.is_active).length}
          href="/apps/hyperlocal/settings?tab=crm"
        />
        <StatusCard
          icon={<Mail className="h-4 w-4" />}
          label="Email connections"
          value={emailConnections.filter((c) => c.is_active).length}
          href="/apps/hyperlocal/settings?tab=email"
        />
        <StatusCard
          icon={<Inbox className="h-4 w-4" />}
          label="Campaigns"
          value={campaigns.length}
          href="/apps/hyperlocal/campaigns"
        />
        <StatusCard
          icon={<Ban className="h-4 w-4" />}
          label="Suppressed"
          value={suppressionCount}
          href="/apps/hyperlocal/settings?tab=suppression"
        />
      </div>

      {/* Connections detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">CRM connections</h2>
            <Link
              href="/apps/hyperlocal/settings?tab=crm"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Manage
            </Link>
          </div>
          {crmConnections.length === 0 ? (
            <EmptyState
              text="No CRMs connected yet."
              actionText="Connect a CRM"
              actionHref="/apps/hyperlocal/settings?tab=crm"
            />
          ) : (
            <ul className="space-y-2">
              {crmConnections.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.label || CRM_PLATFORM_LABELS[c.platform]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {CRM_PLATFORM_LABELS[c.platform]}
                    </p>
                  </div>
                  {c.last_error ? (
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Email connections</h2>
            <Link
              href="/apps/hyperlocal/settings?tab=email"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Manage
            </Link>
          </div>
          {emailConnections.length === 0 ? (
            <EmptyState
              text="No sending account connected yet."
              actionText="Connect email"
              actionHref="/apps/hyperlocal/settings?tab=email"
            />
          ) : (
            <ul className="space-y-2">
              {emailConnections.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.display_name || c.email_address}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {EMAIL_PROVIDER_LABELS[c.provider]}
                    </p>
                  </div>
                  {c.is_default && (
                    <span className="text-[10px] font-medium uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent runs */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold mb-3">Recent runs</h2>
        {recentRuns.length === 0 ? (
          <EmptyState
            text="You haven't run any campaigns yet."
            actionText="Create your first campaign"
            actionHref="/apps/hyperlocal/campaigns"
          />
        ) : (
          <ul className="space-y-2">
            {recentRuns.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/apps/hyperlocal/runs/${r.id}`}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/40"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {RUN_PHASE_LABELS[r.phase]} ·{" "}
                      {r.contacts_fetched} contacts ·{" "}
                      {r.emails_sent} sent
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">View →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
    </Link>
  );
}

function EmptyState({
  text,
  actionText,
  actionHref,
}: {
  text: string;
  actionText: string;
  actionHref: string;
}) {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-muted-foreground mb-3">{text}</p>
      <Link
        href={actionHref}
        className="text-xs font-medium text-foreground underline underline-offset-2 hover:no-underline"
      >
        {actionText}
      </Link>
    </div>
  );
}
