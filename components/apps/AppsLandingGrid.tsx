"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileText, Radar, Lock, GraduationCap, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { PurchasePackModal } from "@/components/trial/PurchasePackModal";
import { BlogUpgradeModal } from "@/components/blog-engine/BlogUpgradeModal";
import { startNavigationProgress } from "@/lib/navigation-progress";

interface AppCard {
  id: string;
  name: string;
  description: string;
  route: string;
  icon: React.ReactNode;
  flagKey: string;
  requiresPro: boolean;
  hasUpgrade?: boolean;
  external?: boolean;
}

const APPS: AppCard[] = [
  {
    id: "prompt-studio",
    name: "Prompt Studio",
    description: "AI-powered prompt engineering",
    route: "/apps/prompt-studio",
    icon: <Sparkles className="h-6 w-6" />,
    flagKey: "PROMPT_STUDIO",
    requiresPro: false,
    hasUpgrade: true,
  },
  {
    id: "blog-engine",
    name: "Blog Engine",
    description: "Automated BOFU blog generation",
    route: "/apps/blog-engine",
    icon: <FileText className="h-6 w-6" />,
    flagKey: "BLOG_ENGINE",
    requiresPro: true,
    hasUpgrade: true,
  },
  {
    id: "radar",
    name: "Radar",
    description: "AI search visibility monitoring",
    route: "/apps/radar",
    icon: <Radar className="h-6 w-6" />,
    flagKey: "RADAR",
    requiresPro: true,
    hasUpgrade: true,
  },
  {
    id: "aim-academy",
    name: "AiM Academy",
    description: "AI marketing courses & community",
    route: "https://aimarketingacademy.com",
    icon: <GraduationCap className="h-6 w-6" />,
    flagKey: "AIM_ACADEMY",
    requiresPro: false,
    external: true,
  },
];

export interface UsageStats {
  "prompt-studio": { used: number; limit: number; period: string } | null;
  "blog-engine": { used: number; limit: number; period: string } | null;
  "radar": { used: number; limit: number; period: string } | null;
}

interface AppsLandingGridProps {
  flags: Record<string, boolean>;
  subscriptionTier: string;
  usageStats: UsageStats;
}

export function AppsLandingGrid({ flags, subscriptionTier, usageStats }: AppsLandingGridProps) {
  const router = useRouter();
  const isPro = subscriptionTier === "pro";

  const [showPromptPackModal, setShowPromptPackModal] = useState(false);
  const [showBlogUpgradeModal, setShowBlogUpgradeModal] = useState(false);

  const handleGetMore = (appId: string) => {
    if (appId === "prompt-studio") setShowPromptPackModal(true);
    if (appId === "blog-engine") setShowBlogUpgradeModal(true);
    // Radar paywall preview will be rebuilt as a generic
    // "Pro Required" modal once we sort the multi-app paywall story.
    // For now, non-Pro clicks fall through to the route's tier check
    // which redirects to /apps/prompt-studio?upgrade=radar.
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {APPS.map((app) => {
          // External links are always accessible
          if (app.external) {
            return (
              <div
                key={app.id}
                className="relative flex flex-col items-center gap-3 rounded-xl border p-6 text-center"
              >
                <span className="flex items-center justify-center w-12 h-12 rounded-lg text-white bg-gradient-to-br from-[#17A697] to-[#1B7FB5]">
                  {app.icon}
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{app.name}</p>
                  <p className="text-xs text-muted-foreground">{app.description}</p>
                </div>
                <a
                  href={app.route}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto w-full flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  Visit <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            );
          }

          const isAvailable = flags[app.flagKey] !== false;
          const needsPro = app.requiresPro && !isPro;
          const isAccessible = isAvailable && !needsPro;
          const stats = usageStats[app.id as keyof UsageStats];

          return (
            <div
              key={app.id}
              className={cn(
                "relative flex flex-col items-center gap-3 rounded-xl border p-6 text-center transition-all",
                !isAccessible && "opacity-60"
              )}
            >
              {/* Badge */}
              {!isAvailable && (
                <span className="absolute top-3 right-3 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  Unavailable
                </span>
              )}
              {isAvailable && needsPro && (
                <span className="absolute top-3 right-3 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  PRO
                </span>
              )}

              {/* Icon */}
              <span
                className={cn(
                  "flex items-center justify-center w-12 h-12 rounded-lg text-white",
                  isAccessible
                    ? "bg-gradient-to-br from-[#17A697] to-[#1B7FB5]"
                    : "bg-muted-foreground/30"
                )}
              >
                {!isAvailable ? <Lock className="h-6 w-6" /> : app.icon}
              </span>

              <div className="space-y-1">
                <p className={cn("text-sm font-semibold", !isAccessible && "text-muted-foreground")}>
                  {app.name}
                </p>
                <p className="text-xs text-muted-foreground">{app.description}</p>
              </div>

              {/* Usage stats */}
              {isAccessible && stats && (
                <div className="w-full space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    {stats.used} / {stats.limit} {stats.period}
                  </p>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#17A697] to-[#1B7FB5] transition-all"
                      style={{
                        width: `${stats.limit > 0 ? Math.min(100, (stats.used / stats.limit) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-auto w-full flex gap-2">
                {isAccessible ? (
                  <>
                    <button
                      onClick={() => {
                        startNavigationProgress();
                        router.push(app.route);
                      }}
                      className="flex-1 rounded-lg bg-gradient-to-r from-[#17A697] to-[#1B7FB5] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Open
                    </button>
                    {app.hasUpgrade && (
                      <button
                        onClick={() => handleGetMore(app.id)}
                        className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                      >
                        Get More
                      </button>
                    )}
                  </>
                ) : isAvailable ? (
                  <button
                    onClick={() => handleGetMore(app.id)}
                    className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    Upgrade
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      <PurchasePackModal
        open={showPromptPackModal}
        onClose={() => setShowPromptPackModal(false)}
      />
      <BlogUpgradeModal
        open={showBlogUpgradeModal}
        onClose={() => setShowBlogUpgradeModal(false)}
      />
    </>
  );
}
