"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Sparkles, FileText, Radar, Mail, Lock, ExternalLink, LayoutGrid } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
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

const APPS: AppDefinition[] = [
  {
    id: "prompt-studio",
    name: "Prompt Studio",
    description: "AI-powered prompt engineering",
    route: "/apps/prompt-studio",
    icon: <Sparkles className="h-4 w-4" />,
    requiresPro: false,
  },
  {
    id: "blog-engine",
    name: "Blog Engine",
    description: "Automated BOFU blog generation",
    route: "/apps/blog-engine",
    icon: <FileText className="h-4 w-4" />,
    requiresPro: true,
  },
  {
    id: "radar",
    name: "Radar",
    description: "AI search visibility monitoring",
    route: "/apps/radar",
    icon: <Radar className="h-4 w-4" />,
    requiresPro: true,
  },
  {
    id: "hyperlocal",
    name: "Hyperlocal",
    description: "Neighborhood market-report email campaigns",
    route: "/apps/hyperlocal",
    icon: <Mail className="h-4 w-4" />,
    requiresPro: true,
    iconClassName: "bg-gradient-to-br from-[#E11D48] to-[#7C3AED]",
  },
];

export function AppSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [proModalOpen, setProModalOpen] = useState(false);
  const [availability, setAvailability] = useState<Record<string, boolean> | null>(null);

  const subscriptionTier = user?.app_metadata?.subscription_tier;
  const isPro = subscriptionTier === "pro";

  useEffect(() => {
    fetch("/api/app-availability")
      .then((res) => res.json())
      .then((data) => setAvailability(data.apps ?? null))
      .catch(() => setAvailability(null));
  }, []);

  // Determine which app is currently active
  const currentApp = APPS.find((app) => pathname?.startsWith(app.route)) ?? APPS[0];

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
              currentApp.iconClassName ?? DEFAULT_ICON_BG
            )}
          >
            {currentApp.icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{currentApp.name}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          {APPS.map((app) => {
            const isActive = pathname?.startsWith(app.route);
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

      {/* AiM Pro Upgrade Modal */}
      <Dialog open={proModalOpen} onOpenChange={setProModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle>Upgrade to AiM Pro</DialogTitle>
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
              Learn About AiM Pro
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
