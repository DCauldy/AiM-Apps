"use client";

import { ProductHeader } from "@/components/app-shell/ProductHeader";

// ============================================================
// Radar (Otterly-backed v2) top nav. Five tabs across the product:
//   Dashboard | Monitor | Research | Optimize | Settings
//
// /apps/radar itself is a redirect to /apps/radar/dashboard so the
// active state always falls into one of the named tabs.
//
// Quota chip + help button + upgrade modal lived on the pre-Otterly
// header; they get rebuilt later against Otterly's account-info API
// (quota chip in Settings, help modal Otterly-aware copy) — leaving
// them out keeps this header clean while the other tabs land.
// ============================================================

const NAV_ITEMS = [
  { label: "Dashboard", href: "/apps/radar/dashboard" },
  { label: "Monitor", href: "/apps/radar/monitor" },
  { label: "Research", href: "/apps/radar/research" },
  { label: "Optimize", href: "/apps/radar/optimize" },
  { label: "Settings", href: "/apps/radar/settings" },
];

function isRadarActive(href: string, pathname: string | null) {
  if (href === "/apps/radar/dashboard") {
    return pathname === "/apps/radar/dashboard" || pathname === "/apps/radar";
  }
  return Boolean(pathname?.startsWith(href));
}

export function RadarHeader() {
  return (
    <ProductHeader
      homeHref="/apps/radar/dashboard"
      navItems={NAV_ITEMS}
      isActive={isRadarActive}
      accentClassName="text-[#e0a458]"
      activeIndicatorClassName="bg-[#e0a458] shadow-[0_0_6px_rgba(224,164,88,0.5)]"
      mobileActiveClassName="text-[#e0a458] bg-[#e0a458]/10"
    />
  );
}
