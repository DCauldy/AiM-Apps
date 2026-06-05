import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageFrameProps = {
  children: ReactNode;
  className?: string;
};

export function PageFrame({ children, className }: PageFrameProps) {
  return (
    <div className={cn("container max-w-6xl mx-auto px-4 py-8 space-y-6", className)}>
      {children}
    </div>
  );
}

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

type PageSectionProps = {
  children: ReactNode;
  className?: string;
};

export function PageSection({ children, className }: PageSectionProps) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

type DashboardCardProps = {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  className?: string;
};

export function DashboardCard({ children, title, action, className }: DashboardCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

type MetricCardProps = {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  href?: string;
  className?: string;
};

export function MetricCard({ icon, label, value, href, className }: MetricCardProps) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "rounded-lg border border-border bg-card p-4 hover:bg-muted/40 transition-colors",
          className
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      {content}
    </div>
  );
}

type EmptyStateProps = {
  text: string;
  actionText?: string;
  actionHref?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  text,
  actionText,
  actionHref,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("text-center py-6", className)}>
      <p className="text-sm text-muted-foreground mb-3">{text}</p>
      {action ??
        (actionText && actionHref ? (
          <Link
            href={actionHref}
            className="text-xs font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            {actionText}
          </Link>
        ) : null)}
    </div>
  );
}

type InlineStatusBannerProps = {
  children: ReactNode;
  className?: string;
};

export function InlineStatusBanner({ children, className }: InlineStatusBannerProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 text-sm", className)}>
      {children}
    </div>
  );
}

type SettingsTabsProps = {
  children: ReactNode;
  className?: string;
};

export function SettingsTabs({ children, className }: SettingsTabsProps) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}
