"use client";

import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export type ProductWelcomeStat = {
  value: string;
  label: string;
  source: string;
  sourceUrl?: string;
};

export type ProductWelcomeFeature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type ProductWelcomeProps = {
  badgeText: string;
  title: string;
  description: string;
  stats: ProductWelcomeStat[];
  features: ProductWelcomeFeature[];
  ctaLabel: string;
  ctaHref: string;
  ctaHelpText: string;
  accentClassName: string;
  accentBgClassName: string;
  ctaClassName: string;
  ctaShadowClassName: string;
  sourceHoverClassName?: string;
};

export function ProductWelcome({
  badgeText,
  title,
  description,
  stats,
  features,
  ctaLabel,
  ctaHref,
  ctaHelpText,
  accentClassName,
  accentBgClassName,
  ctaClassName,
  ctaShadowClassName,
  sourceHoverClassName,
}: ProductWelcomeProps) {
  const router = useRouter();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <div
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4",
              accentBgClassName,
              accentClassName
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", ctaClassName)} />
            {badgeText}
          </div>
          <h1 className="font-sans text-3xl sm:text-4xl font-bold text-foreground mb-4">
            {title}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex justify-center gap-8 mb-12">
          {stats.map((stat) => (
            <StatCard
              key={`${stat.value}-${stat.source}`}
              stat={stat}
              accentClassName={accentClassName}
              sourceHoverClassName={sourceHoverClassName}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border bg-card p-5 hover:bg-accent/30 transition-colors"
            >
              <feature.icon className={cn("h-5 w-5 mb-3", accentClassName)} />
              <h3 className="font-sans text-sm font-semibold text-foreground mb-1">
                {feature.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={() => router.push(ctaHref)}
            className={cn(
              "inline-flex items-center gap-2 px-8 py-3 text-base font-semibold rounded-lg transition-colors shadow-lg",
              ctaClassName,
              ctaShadowClassName
            )}
          >
            {ctaLabel}
          </button>
          <p className="text-xs text-muted-foreground mt-3">{ctaHelpText}</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  stat,
  accentClassName,
  sourceHoverClassName,
}: {
  stat: ProductWelcomeStat;
  accentClassName: string;
  sourceHoverClassName?: string;
}) {
  const source = `— ${stat.source}`;

  return (
    <div className="text-center">
      <div className={cn("text-2xl font-bold", accentClassName)}>{stat.value}</div>
      <div className="text-xs text-muted-foreground mt-1 max-w-[160px]">
        {stat.label}
      </div>
      {stat.sourceUrl ? (
        <a
          href={stat.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "text-[10px] text-muted-foreground/60 mt-1.5 inline-block transition-colors",
            sourceHoverClassName
          )}
        >
          {source}
        </a>
      ) : (
        <span className="text-[10px] text-muted-foreground/60 mt-1.5 inline-block">
          {source}
        </span>
      )}
    </div>
  );
}
