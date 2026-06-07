"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  FileText,
  Radar,
  Mail,
  MapPin,
  Lock,
  GraduationCap,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Zap,
  BarChart3,
  Brain,
  Target,
  PenTool,
  Globe,
  Search,
  TrendingUp,
  BookOpen,
  Users,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PurchasePackModal } from "@/components/trial/PurchasePackModal";
import { BlogUpgradeModal } from "@/components/blog-engine/BlogUpgradeModal";
import { RadarUpgradeModal } from "@/components/radar/RadarUpgradeModal";

/* ── Types ── */

export interface UsageStats {
  "prompt-studio": { used: number; limit: number; period: string } | null;
  "blog-engine": { used: number; limit: number; period: string } | null;
  "radar": { used: number; limit: number; period: string } | null;
  "hyperlocal": { used: number; limit: number; period: string } | null;
}

interface AppMeta {
  id: string;
  name: string;
  description: string;
  tagline: string;
  route: string;
  icon: React.ReactNode;
  previewIcon: React.ReactNode;
  flagKey: string;
  requiresPro: boolean;
  hasUpgrade?: boolean;
  external?: boolean;
  gradient: [string, string];
  accentColor: string;
  category: string;
  features: { icon: React.ReactNode; text: string }[];
}

/* ── App Config ── */

const APPS: AppMeta[] = [
  {
    id: "prompt-studio",
    name: "Prompt Studio",
    description: "AI-powered prompt engineering",
    tagline: "Craft prompts that convert. Powered by AI.",
    route: "/apps/prompt-studio",
    icon: <Sparkles className="h-5 w-5" />,
    previewIcon: <Sparkles className="h-10 w-10" />,
    flagKey: "PROMPT_STUDIO",
    requiresPro: false,
    hasUpgrade: true,
    gradient: ["#1B7FB5", "#1C4C8A"],
    accentColor: "#1B7FB5",
    category: "Creative",
    features: [
      { icon: <Brain className="h-4 w-4" />, text: "AI-guided prompt builder with real-time suggestions" },
      { icon: <Zap className="h-4 w-4" />, text: "One-click prompt refinement and optimization" },
      { icon: <PenTool className="h-4 w-4" />, text: "Template library for marketing & real estate" },
      { icon: <BarChart3 className="h-4 w-4" />, text: "Track prompt performance across campaigns" },
    ],
  },
  {
    id: "blog-engine",
    name: "Blog Engine",
    description: "Automated BOFU blog generation",
    tagline: "Publish SEO-optimized blogs on autopilot.",
    route: "/apps/blog-engine",
    icon: <FileText className="h-5 w-5" />,
    previewIcon: <FileText className="h-10 w-10" />,
    flagKey: "BLOG_ENGINE",
    requiresPro: true,
    hasUpgrade: true,
    gradient: ["#17A697", "#31DBA5"],
    accentColor: "#31DBA5",
    category: "Content",
    features: [
      { icon: <Target className="h-4 w-4" />, text: "Bottom-of-funnel topics researched automatically" },
      { icon: <PenTool className="h-4 w-4" />, text: "Claude-written long-form articles with citations" },
      { icon: <Globe className="h-4 w-4" />, text: "Direct publishing to WordPress" },
      { icon: <BarChart3 className="h-4 w-4" />, text: "Weekly content calendar with 3 blogs per week" },
    ],
  },
  {
    id: "radar",
    name: "Radar",
    description: "AI search visibility monitoring",
    tagline: "See where AI recommends you — and your competitors.",
    route: "/apps/radar",
    icon: <Radar className="h-5 w-5" />,
    previewIcon: <Radar className="h-10 w-10" />,
    flagKey: "RADAR",
    requiresPro: true,
    hasUpgrade: true,
    gradient: ["#D97706", "#E0A458"],
    accentColor: "#E0A458",
    category: "Analytics",
    features: [
      { icon: <Search className="h-4 w-4" />, text: "Monitor AI search results across major platforms" },
      { icon: <TrendingUp className="h-4 w-4" />, text: "Track visibility trends over time" },
      { icon: <Target className="h-4 w-4" />, text: "Competitor benchmarking and gap analysis" },
      { icon: <BarChart3 className="h-4 w-4" />, text: "Actionable insights to improve AI rankings" },
    ],
  },
  {
    id: "hyperlocal",
    name: "Hyperlocal",
    description: "Neighborhood market-report email campaigns",
    tagline: "Hyperlocal market reports, sent from your own inbox.",
    route: "/apps/hyperlocal",
    icon: <Mail className="h-5 w-5" />,
    previewIcon: <MapPin className="h-10 w-10" />,
    flagKey: "HYPERLOCAL",
    requiresPro: true,
    hasUpgrade: true,
    gradient: ["#E11D48", "#7C3AED"],
    accentColor: "#F43F5E",
    category: "Outreach",
    features: [
      { icon: <Users className="h-4 w-4" />, text: "Pulls live contacts from your CRM (FUB, Lofty, CSV)" },
      { icon: <MapPin className="h-4 w-4" />, text: "Segments by ZIP, city, or neighborhood automatically" },
      { icon: <PenTool className="h-4 w-4" />, text: "Claude-written market reports using your MLS data" },
      { icon: <Mail className="h-4 w-4" />, text: "Sends from your Gmail, Outlook, or verified domain" },
    ],
  },
  {
    id: "aim-academy",
    name: "AiM Academy",
    description: "AI marketing courses & community",
    tagline: "Master AI marketing with expert-led courses.",
    route: "https://aimarketingacademy.com",
    icon: <GraduationCap className="h-5 w-5" />,
    previewIcon: <GraduationCap className="h-10 w-10" />,
    flagKey: "AIM_ACADEMY",
    requiresPro: false,
    external: true,
    gradient: ["#17A697", "#1B7FB5"],
    accentColor: "#17A697",
    category: "Education",
    features: [
      { icon: <BookOpen className="h-4 w-4" />, text: "Self-paced AI marketing courses" },
      { icon: <Users className="h-4 w-4" />, text: "Private community of real estate professionals" },
      { icon: <Award className="h-4 w-4" />, text: "Certifications and actionable playbooks" },
      { icon: <Zap className="h-4 w-4" />, text: "Weekly live sessions with industry experts" },
    ],
  },
];

/* ── Props ── */

interface AppsShowcaseProps {
  flags: Record<string, boolean>;
  subscriptionTier: string;
  usageStats: UsageStats;
}

/* ── Usage Bar ── */

function UsageBar({
  stats,
  accentColor,
  gradient,
}: {
  stats: { used: number; limit: number; period: string };
  accentColor: string;
  gradient: [string, string];
}) {
  const [width, setWidth] = useState(0);
  const pct = stats.limit > 0 ? Math.min(100, (stats.used / stats.limit) * 100) : 0;

  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 100);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Usage {stats.period}</span>
        <span className="text-foreground font-medium">
          {stats.used} / {stats.limit}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${width}%`,
            background: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`,
          }}
        />
      </div>
    </div>
  );
}

/* ── Main Component ── */

export function AppsShowcase({ flags, subscriptionTier, usageStats }: AppsShowcaseProps) {
  const router = useRouter();
  const isPro = subscriptionTier === "pro";

  const [selectedId, setSelectedId] = useState<string>(APPS[0].id);
  const [showPromptPackModal, setShowPromptPackModal] = useState(false);
  const [showBlogUpgradeModal, setShowBlogUpgradeModal] = useState(false);
  const [showRadarUpgradeModal, setShowRadarUpgradeModal] = useState(false);

  // Mobile accordion
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);

  // Animation key to force re-render on selection change
  const [animKey, setAnimKey] = useState(0);

  const selectedApp = APPS.find((a) => a.id === selectedId) ?? APPS[0];

  const selectApp = useCallback(
    (id: string) => {
      if (id !== selectedId) {
        setSelectedId(id);
        setAnimKey((k) => k + 1);
      }
    },
    [selectedId]
  );

  const handleGetMore = (appId: string) => {
    if (appId === "prompt-studio") setShowPromptPackModal(true);
    if (appId === "blog-engine") setShowBlogUpgradeModal(true);
    if (appId === "radar") setShowRadarUpgradeModal(true);
  };

  const getAccessState = (app: AppMeta) => {
    if (app.external) return { isAvailable: true, needsPro: false, isAccessible: true };
    const isAvailable = flags[app.flagKey] !== false;
    const needsPro = app.requiresPro && !isPro;
    return { isAvailable, needsPro, isAccessible: isAvailable && !needsPro };
  };

  const handleAction = (app: AppMeta) => {
    if (app.external) {
      window.open(app.route, "_blank", "noopener,noreferrer");
      return;
    }
    const { isAccessible } = getAccessState(app);
    if (isAccessible) {
      router.push(app.route);
    }
  };

  return (
    <>
      {/* ── Desktop Layout ── */}
      <div className="hidden md:flex items-start gap-6 w-full min-h-[520px]">
        {/* Left panel — App List */}
        <div className="w-[35%] min-w-[260px] flex flex-col gap-1.5">
          {APPS.map((app) => {
            const { isAvailable, needsPro, isAccessible } = getAccessState(app);
            const isSelected = selectedId === app.id;

            return (
              <button
                key={app.id}
                onClick={() => selectApp(app.id)}
                className={cn(
                  "group relative flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left transition-all duration-200",
                  isSelected
                    ? "glass-card"
                    : "bg-white/[0.04] hover:bg-white/[0.08] border border-white/10"
                )}
                style={
                  isSelected
                    ? { borderColor: `${app.accentColor}30` }
                    : undefined
                }
              >
                {/* Active indicator */}
                <div
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-200",
                    isSelected ? "h-8 opacity-100" : "h-0 opacity-0"
                  )}
                  style={{ backgroundColor: app.accentColor }}
                />

                {/* Icon */}
                <span
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl text-white shrink-0 transition-all duration-200",
                    !isAccessible && !app.external && "opacity-40"
                  )}
                  style={{
                    background:
                      isAccessible || app.external
                        ? `linear-gradient(135deg, ${app.gradient[0]}, ${app.gradient[1]})`
                        : undefined,
                  }}
                >
                  {!isAvailable && !app.external ? (
                    <Lock className="h-5 w-5" />
                  ) : (
                    app.icon
                  )}
                </span>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-semibold truncate",
                        isSelected ? "text-foreground" : "text-foreground/70",
                        !isAccessible && !app.external && "text-muted-foreground"
                      )}
                    >
                      {app.name}
                    </span>
                    {!isAvailable && !app.external && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Unavailable
                      </span>
                    )}
                    {isAvailable && needsPro && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          color: app.accentColor,
                          backgroundColor: `${app.accentColor}15`,
                        }}
                      >
                        PRO
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground truncate block">
                    {app.category}
                  </span>
                </div>

                {/* Chevron */}
                <ChevronRight
                  className={cn(
                    "h-4 w-4 text-muted-foreground/50 transition-all duration-200 shrink-0",
                    isSelected && "text-foreground/60 translate-x-0.5"
                  )}
                />
              </button>
            );
          })}
        </div>

        {/* Right panel — Preview */}
        <div
          key={animKey}
          className="flex-1 rounded-3xl overflow-hidden glass-card animate-slide-in-right min-h-[520px] flex flex-col"
          style={{ borderColor: `${selectedApp.accentColor}20` }}
        >
          {/* Hero gradient */}
          <div
            className="relative px-8 pt-8 pb-6"
            style={{
              background: `linear-gradient(135deg, ${selectedApp.gradient[0]}18, ${selectedApp.gradient[1]}10)`,
            }}
          >
            {/* Large icon */}
            <div
              className="animate-fade-up w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg mb-4"
              style={{
                background: `linear-gradient(135deg, ${selectedApp.gradient[0]}, ${selectedApp.gradient[1]})`,
                animationDelay: "0ms",
              }}
            >
              {selectedApp.previewIcon}
            </div>

            <h2
              className="animate-fade-up text-2xl font-bold text-foreground"
              style={{ animationDelay: "50ms" }}
            >
              {selectedApp.name}
            </h2>
            <p
              className="animate-fade-up text-sm text-muted-foreground mt-1"
              style={{ animationDelay: "100ms" }}
            >
              {selectedApp.tagline}
            </p>

            {/* Category pill */}
            <div
              className="animate-fade-up inline-flex items-center gap-1.5 mt-3 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{
                color: selectedApp.accentColor,
                backgroundColor: `${selectedApp.accentColor}15`,
                animationDelay: "150ms",
              }}
            >
              {selectedApp.category}
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-6 space-y-6 flex-1 flex flex-col">
            {/* Features */}
            <div
              className="animate-fade-up space-y-3"
              style={{ animationDelay: "200ms" }}
            >
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Features
              </h3>
              <div className="grid gap-2.5">
                {selectedApp.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                      style={{
                        color: selectedApp.accentColor,
                        backgroundColor: `${selectedApp.accentColor}12`,
                      }}
                    >
                      {f.icon}
                    </span>
                    <span className="text-sm text-foreground/80 leading-snug pt-0.5">
                      {f.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Usage Stats */}
            {(() => {
              const { isAccessible } = getAccessState(selectedApp);
              const stats = usageStats[selectedApp.id as keyof UsageStats];
              if (!isAccessible || !stats) return null;
              return (
                <div
                  className="animate-fade-up rounded-xl p-4"
                  style={{
                    background: `linear-gradient(135deg, ${selectedApp.gradient[0]}12, ${selectedApp.gradient[1]}08)`,
                    animationDelay: "250ms",
                  }}
                >
                  <UsageBar
                    stats={stats}
                    accentColor={selectedApp.accentColor}
                    gradient={selectedApp.gradient}
                  />
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div
              className="animate-fade-up flex gap-3 mt-auto pt-2"
              style={{ animationDelay: "300ms" }}
            >
              {(() => {
                const { isAvailable, needsPro, isAccessible } = getAccessState(selectedApp);

                if (selectedApp.external) {
                  return (
                    <a
                      href={selectedApp.route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{
                        background: `linear-gradient(135deg, ${selectedApp.gradient[0]}, ${selectedApp.gradient[1]})`,
                      }}
                    >
                      Visit Site <ExternalLink className="h-4 w-4" />
                    </a>
                  );
                }

                if (isAccessible) {
                  return (
                    <>
                      <button
                        onClick={() => handleAction(selectedApp)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        style={{
                          background: `linear-gradient(135deg, ${selectedApp.gradient[0]}, ${selectedApp.gradient[1]})`,
                        }}
                      >
                        Open App <ArrowRight className="h-4 w-4" />
                      </button>
                      {selectedApp.hasUpgrade && (
                        <button
                          onClick={() => handleGetMore(selectedApp.id)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-border transition-colors hover:bg-muted"
                        >
                          Get More
                        </button>
                      )}
                    </>
                  );
                }

                if (isAvailable && needsPro) {
                  return (
                    <button
                      onClick={() => handleGetMore(selectedApp.id)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{
                        background: `linear-gradient(135deg, ${selectedApp.gradient[0]}, ${selectedApp.gradient[1]})`,
                      }}
                    >
                      Upgrade to Pro <ArrowRight className="h-4 w-4" />
                    </button>
                  );
                }

                return (
                  <span className="text-sm text-muted-foreground italic">
                    This app is currently unavailable.
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Layout — Accordion ── */}
      <div className="flex flex-col gap-3 md:hidden">
        {APPS.map((app) => {
          const { isAvailable, needsPro, isAccessible } = getAccessState(app);
          const isExpanded = expandedMobile === app.id;
          const stats = usageStats[app.id as keyof UsageStats];

          return (
            <div
              key={app.id}
              className={cn(
                "rounded-2xl overflow-hidden transition-all duration-300 glass-card",
                isExpanded && "shadow-lg"
              )}
              style={
                isExpanded ? { borderColor: `${app.accentColor}30` } : undefined
              }
            >
              {/* Header — tap to expand */}
              <button
                onClick={() =>
                  setExpandedMobile(isExpanded ? null : app.id)
                }
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl text-white shrink-0",
                    !isAccessible && !app.external && "opacity-40"
                  )}
                  style={{
                    background:
                      isAccessible || app.external
                        ? `linear-gradient(135deg, ${app.gradient[0]}, ${app.gradient[1]})`
                        : undefined,
                  }}
                >
                  {!isAvailable && !app.external ? (
                    <Lock className="h-5 w-5" />
                  ) : (
                    app.icon
                  )}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">
                      {app.name}
                    </span>
                    {!isAvailable && !app.external && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Unavailable
                      </span>
                    )}
                    {isAvailable && needsPro && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          color: app.accentColor,
                          backgroundColor: `${app.accentColor}15`,
                        }}
                      >
                        PRO
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {app.description}
                  </span>
                </div>

                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-180"
                  )}
                />
              </button>

              {/* Expanded content */}
              <div
                className={cn(
                  "overflow-hidden transition-all duration-300",
                  isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className="px-4 pb-4 space-y-4">
                  {/* Tagline */}
                  <p className="text-sm text-muted-foreground">
                    {app.tagline}
                  </p>

                  {/* Features */}
                  <div className="space-y-2">
                    {app.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span
                          className="mt-0.5 flex items-center justify-center w-6 h-6 rounded-md shrink-0"
                          style={{
                            color: app.accentColor,
                            backgroundColor: `${app.accentColor}12`,
                          }}
                        >
                          {f.icon}
                        </span>
                        <span className="text-xs text-foreground/80 leading-snug pt-0.5">
                          {f.text}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Usage */}
                  {isAccessible && stats && (
                    <div
                      className="rounded-xl p-3"
                      style={{
                        background: `linear-gradient(135deg, ${app.gradient[0]}12, ${app.gradient[1]}08)`,
                      }}
                    >
                      <UsageBar
                        stats={stats}
                        accentColor={app.accentColor}
                        gradient={app.gradient}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {app.external ? (
                      <a
                        href={app.route}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        style={{
                          background: `linear-gradient(135deg, ${app.gradient[0]}, ${app.gradient[1]})`,
                        }}
                      >
                        Visit Site <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : isAccessible ? (
                      <>
                        <button
                          onClick={() => handleAction(app)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                          style={{
                            background: `linear-gradient(135deg, ${app.gradient[0]}, ${app.gradient[1]})`,
                          }}
                        >
                          Open <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        {app.hasUpgrade && (
                          <button
                            onClick={() => handleGetMore(app.id)}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-border transition-colors hover:bg-muted"
                          >
                            Get More
                          </button>
                        )}
                      </>
                    ) : isAvailable && needsPro ? (
                      <button
                        onClick={() => handleGetMore(app.id)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        style={{
                          background: `linear-gradient(135deg, ${app.gradient[0]}, ${app.gradient[1]})`,
                        }}
                      >
                        Upgrade to Pro <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
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
      <RadarUpgradeModal
        open={showRadarUpgradeModal}
        onClose={() => setShowRadarUpgradeModal(false)}
      />
    </>
  );
}
