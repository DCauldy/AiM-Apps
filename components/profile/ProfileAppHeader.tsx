"use client";

import { ProductHeader } from "@/components/app-shell/ProductHeader";

const NAV_ITEMS = [{ label: "Profiles", href: "/apps/profile" }];

function isProfileNavActive(href: string, pathname: string | null) {
  if (href === "/apps/profile") {
    return (
      pathname === href ||
      pathname === "/apps/profile/new" ||
      Boolean(pathname?.match(/^\/apps\/profile\/[^/]+$/))
    );
  }
  return Boolean(pathname?.startsWith(href));
}

export function ProfileAppHeader() {
  return (
    <ProductHeader
      homeHref="/apps/profile"
      navItems={NAV_ITEMS}
      accentClassName="text-foreground"
      activeIndicatorClassName="bg-foreground"
      mobileActiveClassName="text-foreground bg-accent"
      isActive={isProfileNavActive}
    />
  );
}
