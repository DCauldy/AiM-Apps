"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Sparkles, FileText, Radar, Mail, Lock, ExternalLink, LayoutGrid, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/components/profile/ProfileProvider";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const AIM_DASHBOARD_URL = "https://aimarketingacademy.com/dashboard/";
const AIM_PRO_URL = process.env.NEXT_PUBLIC_AIM_UPGRADE_URL ?? "https://aimarketingacademy.com?aim_modal=upgrade";

interface AppDefinition {
  id: string;
  name: string;
  description: string;
  route: string;
  icon: React.ReactNode;
  requiresPro: boolean;
  /** Optional override for the icon background. Defaults to the AiM brand teal→blue. */
  iconClassName?: string;
}

const DEFAULT_ICON_BG = "bg-gradient-to-br from-[#17A697] to-[#1B7FB5]";

// Gradients mirror /apps showcase (AppsShowcase.tsx) so users see the
// same color identity in the switcher dropdown and on the landing.
const APPS: AppDefinition[] = [
  {
    id: "prompt-studio",
    name: "Prompt Studio",
    description: "AI-powered prompt engineering",
    // Route deep so we skip the bounce through /apps/prompt-studio → redirect.
    route: "/apps/prompt-studio/chat",
    icon: <Sparkles className="h-4 w-4" />,
    requiresPro: false,
    iconClassName: "bg-gradient-to-br from-[#1B7FB5] to-[#1C4C8A]",
  },
  {
    id: "blog-engine",
    name: "Blog Engine",
    description: "Automated BOFU blog generation",
    route: "/apps/blog-engine/dashboard",
    icon: <FileText className="h-4 w-4" />,
    requiresPro: true,
    iconClassName: "bg-gradient-to-br from-[#17A697] to-[#31DBA5]",
  },
  {
    id: "radar",
    name: "Radar",
    description: "AI search visibility monitoring",
    route: "/apps/radar/dashboard",
    icon: <Radar className="h-4 w-4" />,
    requiresPro: true,
    iconClassName: "bg-gradient-to-br from-[#D97706] to-[#E0A458]",
  },
  {
    id: "hyperlocal",
    name: "Hyperlocal",
    description: "Neighborhood market-report email campaigns",
    route: "/apps/hyperlocal/dashboard",
    icon: <Mail className="h-4 w-4" />,
    requiresPro: true,
    iconClassName: "bg-gradient-to-br from-[#E11D48] to-[#7C3AED]",
  },
  {
    id: "listing-studio",
    name: "CMA",
    description: "Automated quarterly CMAs sent to your past clients",
    route: "/apps/cma",
    icon: <Building2 className="h-4 w-4" />,
    requiresPro: true,
    iconClassName: "bg-gradient-to-br from-[#1E293B] to-[#D4A35C]",
  },
];

export function AppSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { profiles, activeProfileId, activeProfile, switchProfile: ctxSwitchProfile } = useProfile();

  const [proModalOpen, setProModalOpen] = useState(false);
  const [availability, setAvailability] = useState<Record<string, boolean> | null>(null);
  const [profileSwitchBusy, setProfileSwitchBusy] = useState(false);

  const subscriptionTier = user?.app_metadata?.subscription_tier;
  const isPro = subscriptionTier === "pro";

  useEffect(() => {
    fetch("/api/app-availability")
      .then((res) => res.json())
      .then((data) => setAvailability(data.apps ?? null))
      .catch(() => setAvailability(null));
  }, []);

  const otherProfiles = profiles.filter((p) => p.id !== activeProfileId);

  async function switchProfile(profileId: string) {
    setProfileSwitchBusy(true);
    try {
      await ctxSwitchProfile(profileId);
    } finally {
      setProfileSwitchBusy(false);
    }
  }

  // Determine which app is currently active. Match by app root prefix
  // (/apps/{id}) rather than the deep nav target — sub-pages like
  // /apps/blog-engine/topics or /apps/hyperlocal/runs/[id] still need
  // to resolve to their owning app. Cross-app pages (/apps, /apps/profile)
  // match nothing and fall through to the neutral "All Apps" trigger.
  const currentApp = APPS.find((app) =>
    pathname?.startsWith(`/apps/${app.id}`),
  );

  const handleAppSelect = (app: AppDefinition) => {
    const isUnavailable = availability && availability[app.id] === false;
    if (isUnavailable) return;
    if (app.requiresPro && !isPro) {
      setProModalOpen(true);
      return;
    }
    router.push(app.route);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left">
          <span
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-md text-white",
              currentApp ? (currentApp.iconClassName ?? DEFAULT_ICON_BG) : "bg-muted-foreground/30"
            )}
          >
            {currentApp ? currentApp.icon : <LayoutGrid className="h-4 w-4" />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {currentApp ? currentApp.name : "All Apps"}
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64 glass-dropdown text-white border-0">
          {APPS.map((app) => {
            const isActive = pathname?.startsWith(`/apps/${app.id}`);
            const isUnavailable = availability ? availability[app.id] === false : false;
            const isLocked = !isUnavailable && app.requiresPro && !isPro;
            const isDisabled = isUnavailable || isLocked;

            return (
              <DropdownMenuItem
                key={app.id}
                onClick={() => handleAppSelect(app)}
                className={cn(
                  "flex items-center gap-3 py-2.5 cursor-pointer",
                  isActive && "bg-accent",
                  isUnavailable && "opacity-60 cursor-not-allowed"
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-md text-white",
                    isDisabled
                      ? "bg-muted-foreground/30"
                      : (app.iconClassName ?? DEFAULT_ICON_BG)
                  )}
                >
                  {isDisabled ? <Lock className="h-3.5 w-3.5" /> : app.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", isDisabled && "text-muted-foreground")}>
                    {app.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{app.description}</p>
                </div>
                {isUnavailable && (
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    Unavailable
                  </span>
                )}
                {isLocked && (
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    PRO
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}

          {profiles.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Operating as
              </div>
              {activeProfile && (
                <div className="px-3 py-1.5 mx-1 mb-1 rounded-md bg-accent/50">
                  <p className="text-sm font-semibold truncate">{activeProfile.display_name}</p>
                  {activeProfile.brokerage && (
                    <p className="text-[11px] text-muted-foreground truncate">{activeProfile.brokerage}</p>
                  )}
                </div>
              )}
              {otherProfiles.slice(0, 5).map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => switchProfile(p.id)}
                  className={cn(
                    "flex items-center gap-2 py-1.5 cursor-pointer",
                    profileSwitchBusy && "opacity-50 pointer-events-none"
                  )}
                >
                  <span
                    className="w-6 h-6 rounded-md shrink-0"
                    style={{ background: `linear-gradient(135deg, ${p.primary_color}, ${p.accent_color})` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.display_name}</p>
                    {p.brokerage && (
                      <p className="text-[11px] text-muted-foreground truncate">{p.brokerage}</p>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => router.push("/apps/profile")}
                className="flex items-center gap-2 py-1.5 cursor-pointer text-muted-foreground"
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-md bg-muted">
                  <Building2 className="h-3.5 w-3.5" />
                </span>
                <p className="text-xs">Manage profiles</p>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => router.push("/apps")}
            className="flex items-center gap-3 py-2.5 cursor-pointer"
          >
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-[#1A2A3A] text-white">
              <LayoutGrid className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Apps Dashboard</p>
              <p className="text-xs text-muted-foreground">View all apps</p>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => window.location.href = AIM_DASHBOARD_URL}
            className="flex items-center gap-3 py-2.5 cursor-pointer"
          >
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-[#1A2A3A] text-white">
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Return to AiM</p>
              <p className="text-xs text-muted-foreground">Back to your dashboard</p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* AiM Automations Upgrade Modal */}
      <Dialog open={proModalOpen} onOpenChange={setProModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle>Upgrade to AiM Automations</DialogTitle>
              <DialogClose onClose={() => setProModalOpen(false)} />
            </div>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="rounded-lg bg-gradient-to-br from-[#17A697]/10 to-[#1B7FB5]/10 p-4 border border-[#17A697]/20">
                <h3 className="font-semibold text-sm mb-2">Blog Engine</h3>
                <p className="text-sm text-muted-foreground">
                  Automated BOFU blog generation that researches your market, writes
                  SEO-optimized content, and publishes to your website — on autopilot.
                </p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-[#17A697]">&#10003;</span>
                  3 blogs per week included
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#17A697]">&#10003;</span>
                  SEO & AEO optimized with schema markup
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#17A697]">&#10003;</span>
                  Auto-publish to WordPress or via webhook
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#17A697]">&#10003;</span>
                  AI-generated featured images
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#17A697]">&#10003;</span>
                  Access to all current & future AiM apps
                </li>
              </ul>
            </div>
          </DialogBody>
          <div className="flex justify-end gap-3 p-6 border-t bg-muted">
            <Button variant="outline" onClick={() => setProModalOpen(false)}>
              Maybe Later
            </Button>
            <Button
              className="bg-[#17A697] hover:bg-[#0F7A6F]"
              onClick={() => window.open(AIM_PRO_URL, "_blank")}
            >
              Learn About AiM Automations
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
