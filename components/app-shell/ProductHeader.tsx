"use client";

import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CornerDownRight, Menu, X } from "lucide-react";

import { AppSwitcher } from "@/components/layout/AppSwitcher";
import { UserMenu } from "@/components/layout/UserMenu";
import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export type ProductNavItem = {
  label: string;
  href: string;
};

type ProductHeaderProps = {
  homeHref: string;
  navItems: ProductNavItem[];
  navVariant?: "tabs" | "breadcrumbs";
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
  navVariant = "tabs",
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
  const isBreadcrumbNav = navVariant === "breadcrumbs";

  return (
    <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="relative flex items-center h-14 px-4">
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

        {isBreadcrumbNav ? (
          <DesktopBreadcrumbNav
            items={navItems}
            currentClassName={accentClassName}
          />
        ) : (
          <DesktopTabNav
            items={navItems}
            isItemActive={isItemActive}
            accentClassName={accentClassName}
            activeIndicatorClassName={activeIndicatorClassName}
          />
        )}

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
          {isBreadcrumbNav ? (
            <MobileBreadcrumbNav
              items={navItems}
              currentClassName={mobileActiveClassName}
            />
          ) : (
            <MobileTabNav
              items={navItems}
              isItemActive={isItemActive}
              mobileActiveClassName={mobileActiveClassName}
            />
          )}
          <div className="pt-2 border-t border-[hsl(var(--border))]">
            <AppSwitcher />
          </div>
          {mobileExtraSlot}
        </nav>
      )}
    </header>
  );
}

function DesktopTabNav({
  items,
  isItemActive,
  accentClassName,
  activeIndicatorClassName,
}: {
  items: ProductNavItem[];
  isItemActive: (href: string) => boolean;
  accentClassName: string;
  activeIndicatorClassName: string;
}) {
  return (
    // Absolute-centered nav so it sits at the true viewport center
    // regardless of asymmetric left/right slot widths.
    <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
      {items.map((item) => {
        const active = isItemActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative rounded-md px-3 py-2 font-body text-sm font-medium transition-colors",
              active
                ? accentClassName
                : "text-[hsl(var(--muted-foreground))] hover:text-foreground",
            )}
          >
            {item.label}
            {active && (
              <span
                className={cn(
                  "absolute bottom-0 left-3 right-3 h-0.5 rounded-full",
                  activeIndicatorClassName,
                )}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function DesktopBreadcrumbNav({
  items,
  currentClassName,
}: {
  items: ProductNavItem[];
  currentClassName: string;
}) {
  return (
    <Breadcrumb className="mx-4 hidden min-w-0 flex-1 md:block">
      <BreadcrumbList className="w-full flex-nowrap overflow-hidden">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.href}-${item.label}`}>
              <BreadcrumbItem className="min-w-0">
                {isLast ? (
                  <BreadcrumbPage
                    className={cn(
                      "block max-w-64 truncate font-body text-sm font-medium",
                      currentClassName,
                    )}
                  >
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.href}
                      className="block max-w-48 truncate font-body text-sm font-medium"
                    >
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator className="shrink-0" />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function MobileTabNav({
  items,
  isItemActive,
  mobileActiveClassName,
}: {
  items: ProductNavItem[];
  isItemActive: (href: string) => boolean;
  mobileActiveClassName: string;
}) {
  return (
    <>
      {items.map((item) => {
        const active = isItemActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "block rounded-md px-3 py-2 font-body text-sm font-medium transition-colors",
              active
                ? mobileActiveClassName
                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function MobileBreadcrumbNav({
  items,
  currentClassName,
}: {
  items: ProductNavItem[];
  currentClassName: string;
}) {
  return (
    <ol className="space-y-1">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isNested = index > 0;
        const itemClassName = cn(
          "min-w-0",
          index === 1 && "ml-4",
          index >= 2 && "ml-8",
        );
        const rowClassName = cn(
          "flex min-w-0 items-center gap-2 rounded-md py-2 pr-3 font-body text-sm font-medium transition-colors",
          isNested ? "pl-2" : "pl-3",
        );
        const rowContent = (
          <>
            {isNested && (
              <CornerDownRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]/70" />
            )}
            <span className="truncate">{item.label}</span>
          </>
        );

        if (isLast) {
          return (
            <li key={`${item.href}-${item.label}`} className={itemClassName}>
              <span
                aria-current="page"
                className={cn(rowClassName, currentClassName)}
              >
                {rowContent}
              </span>
            </li>
          );
        }

        return (
          <li key={`${item.href}-${item.label}`} className={itemClassName}>
            <Link
              href={item.href}
              className={cn(
                rowClassName,
                "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground",
              )}
            >
              {rowContent}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
