"use client";

import { ProductHeader } from "@/components/app-shell/ProductHeader";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/apps/hyperlocal/dashboard" },
  { label: "Campaigns", href: "/apps/hyperlocal/campaigns" },
  { label: "Settings", href: "/apps/hyperlocal/settings" },
];

function isHyperlocalActive(href: string, pathname: string | null) {
  if (href === "/apps/hyperlocal/dashboard") {
    return pathname === "/apps/hyperlocal/dashboard" || pathname === "/apps/hyperlocal";
  }
  return Boolean(pathname?.startsWith(href));
}

export function HyperlocalHeader() {
  return (
    <ProductHeader
      homeHref="/apps/hyperlocal/dashboard"
      navItems={NAV_ITEMS}
      isActive={isHyperlocalActive}
      accentClassName="text-[#F43F5E]"
      activeIndicatorClassName="bg-[#F43F5E] shadow-[0_0_6px_rgba(244,63,94,0.5)]"
      mobileActiveClassName="text-[#F43F5E] bg-[#F43F5E]/10"
    />
  );
}
