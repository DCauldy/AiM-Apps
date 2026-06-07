"use client";

import { ProductHeader } from "@/components/app-shell/ProductHeader";

const NAV_ITEMS = [{ label: "Profiles", href: "/apps/profile" }];

export function ProfileAppHeader() {
  return (
    <ProductHeader
      homeHref="/apps/profile"
      navItems={NAV_ITEMS}
      accentClassName="text-foreground"
      activeIndicatorClassName="bg-foreground"
      mobileActiveClassName="text-foreground bg-accent"
    />
  );
}
