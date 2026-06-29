"use client";

import { useState } from "react";

import { ProductHeader } from "@/components/app-shell/ProductHeader";
import { ProductHelpButton } from "@/components/app-shell/ProductHelpButton";
import { HowToUseModal } from "@/components/ui/HowToUseModal";
import { FEATURES } from "@/lib/feature-flags";

// ============================================================
// Prompt Studio — top-tab header matching the other product apps.
// Mirrors the BlogEngineHeader / HyperlocalHeader pattern: AiM logo
// on the left (delegated by ProductHeader), AppSwitcher + active
// profile chip, centered nav, help button + UserMenu on the right.
//
// The chat threads sidebar that used to live in the page chrome has
// moved inside the main area (rendered only on /chat routes by the
// layout client). Top-level nav lives here.
// ============================================================

// Chat sits first so users always have a one-click way back to the
// chat surface from any other tab (the threads Sidebar only mounts
// inside /chat routes). Settings is intentionally absent — both
// prompt-studio-specific settings have moved to the global Profile
// editor (Bio / Brand / Mail / etc.).
function buildNavItems(): Array<{ label: string; href: string }> {
  const items: Array<{ label: string; href: string }> = [
    { label: "Chat", href: "/apps/prompt-studio/chat" },
    { label: "AiM Library", href: "/apps/prompt-studio/aim-library" },
    { label: "Bookmarked", href: "/apps/prompt-studio/saved" },
    { label: "Stats", href: "/apps/prompt-studio/stats" },
  ];
  // Community Prompts (the user-shared library) is part of the prompt
  // packs gate. When the flag is on we expose it between Chat and
  // AiM Library; when off the route still exists but isn't a tab.
  if (FEATURES.PROMPT_PACKS) {
    items.splice(2, 0, {
      label: "Community Prompts",
      href: "/apps/prompt-studio/library",
    });
  }
  return items;
}

function isPromptStudioActive(href: string, pathname: string | null) {
  if (href === "/apps/prompt-studio/chat") {
    // Chat is the landing tab — light it up for /apps/prompt-studio
    // (no thread) AND any /chat/[id] thread.
    return (
      pathname === "/apps/prompt-studio" ||
      Boolean(pathname?.startsWith("/apps/prompt-studio/chat"))
    );
  }
  return Boolean(pathname?.startsWith(href));
}

export function PromptStudioHeader() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <ProductHeader
        homeHref="/apps/prompt-studio/chat"
        navItems={buildNavItems()}
        isActive={isPromptStudioActive}
        // Emerald accent — matches the product-app-theme --primary
        // (160 68% 53%), keeping PS visually aligned with the
        // platform-wide dark palette instead of using a per-app brand
        // color the way Blog Engine / Hyperlocal do.
        accentClassName="text-[hsl(var(--primary))]"
        activeIndicatorClassName="bg-[hsl(var(--primary))] shadow-[0_0_6px_hsl(var(--primary)/0.5)]"
        mobileActiveClassName="text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]"
        desktopRightSlot={
          <ProductHelpButton
            title="How to use Prompt Studio"
            gradientId="helpIconGradientPS"
            startColor="#31DBA5"
            middleColor="#25B88A"
            endColor="#1C4C8A"
            dotColor="#317196"
            onClick={() => setShowHelp(true)}
          />
        }
      />
      <HowToUseModal open={showHelp} onOpenChange={setShowHelp} />
    </>
  );
}
