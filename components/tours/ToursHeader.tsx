"use client";

import { ProductHeader } from "@/components/app-shell/ProductHeader";

const NAV_ITEMS = [{ label: "Dashboard", href: "/apps/tours" }];

function isToursActive(href: string, pathname: string | null) {
  return Boolean(pathname?.startsWith(href));
}

export function ToursHeader() {
  return (
    <ProductHeader
      homeHref="/apps/tours"
      navItems={[]}
      isActive={isToursActive}
      accentClassName="text-[#6366F1]"
      activeIndicatorClassName="bg-gradient-to-r from-[#2563EB] to-[#7C3AED]"
      mobileActiveClassName="bg-[#6366F1]/10 text-[#6366F1]"
    />
  );
}
