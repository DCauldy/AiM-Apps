"use client";

import { ProductHeader } from "@/components/app-shell/ProductHeader";

// Heat's identity is fire: Fire Red → Burnt Orange.
const NAV_ITEMS = [{ label: "New Search", href: "/apps/heat" }];

function isHeatActive(href: string, pathname: string | null) {
  if (href === "/apps/heat") {
    return pathname === "/apps/heat" || Boolean(pathname?.startsWith("/apps/heat/board"));
  }
  return Boolean(pathname?.startsWith(href));
}

export function HeatHeader() {
  return (
    <ProductHeader
      homeHref="/apps/heat"
      navItems={NAV_ITEMS}
      isActive={isHeatActive}
      accentClassName="text-[#FF6A3D]"
      activeIndicatorClassName="bg-[#FF3B30] shadow-[0_0_6px_rgba(255,59,48,0.5)]"
      mobileActiveClassName="text-[#FF6A3D] bg-[#FF3B30]/10"
    />
  );
}
