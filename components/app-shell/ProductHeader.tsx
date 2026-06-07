"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { AppSwitcher } from "@/components/layout/AppSwitcher";
import { UserMenu } from "@/components/layout/UserMenu";
import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";
import { cn } from "@/lib/utils";

export type ProductNavItem = {
  label: string;
  href: string;
};

type ProductHeaderProps = {
  homeHref: string;
  navItems: ProductNavItem[];
  accentClassName: string;
  activeIndicatorClassName: string;
  mobileActiveClassName: string;
  isActive?: (href: string, pathname: string | null) => boolean;
  desktopRightSlot?: ReactNode;
  mobileExtraSlot?: ReactNode;
};

function defaultIsActive(href: string, pathname: string | null) {
  return Boolean(pathname?.startsWith(href));
}

export function ProductHeader({
  homeHref,
  navItems,
  accentClassName,
  activeIndicatorClassName,
  mobileActiveClassName,
  isActive = defaultIsActive,
  desktopRightSlot,
  mobileExtraSlot,
}: ProductHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isItemActive = (href: string) => isActive(href, pathname);

  return (
    <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="flex items-center h-14 px-4">
        <div className="flex items-center gap-3 shrink-0">
          <Link href={homeHref} className="flex items-center gap-2.5">
            <Image
              src="/logo-white.svg"
              alt="AiM Academy"
              width={120}
              height={40}
              className="h-9 w-auto sm:h-10 shrink-0"
            />
          </Link>
          <div className="hidden sm:block">
            <AppSwitcher />
          </div>
          <ActiveProfileBadge />
        </div>

        <nav className="hidden md:flex items-center gap-1 mx-auto">
          {navItems.map((item) => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative px-3 py-2 text-sm font-medium font-body transition-colors rounded-md",
                  active
                    ? accentClassName
                    : "text-[hsl(var(--muted-foreground))] hover:text-foreground"
                )}
              >
                {item.label}
                {active && (
                  <span
                    className={cn(
                      "absolute bottom-0 left-3 right-3 h-0.5 rounded-full",
                      activeIndicatorClassName
                    )}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 ml-auto shrink-0">
          {desktopRightSlot}
          <UserMenu />

          <button
            onClick={() => setMobileOpen((open) => !open)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 space-y-1">
          {navItems.map((item) => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block px-3 py-2 text-sm font-medium font-body rounded-md transition-colors",
                  active
                    ? mobileActiveClassName
                    : "text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="pt-2 border-t border-[hsl(var(--border))]">
            <AppSwitcher />
          </div>
          {mobileExtraSlot}
        </nav>
      )}
    </header>
  );
}
