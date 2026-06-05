"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppSwitcher } from "@/components/layout/AppSwitcher";
import { UserMenu } from "@/components/layout/UserMenu";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/apps/hyperlocal/dashboard" },
  { label: "Campaigns", href: "/apps/hyperlocal/campaigns" },
  { label: "Settings", href: "/apps/hyperlocal/settings" },
];

export function HyperlocalHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/apps/hyperlocal/dashboard") {
      return (
        pathname === "/apps/hyperlocal/dashboard" ||
        pathname === "/apps/hyperlocal"
      );
    }
    return pathname?.startsWith(href);
  };

  return (
    <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="flex items-center h-14 px-4">
        {/* Left: Logo + AppSwitcher */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/apps/hyperlocal/dashboard" className="flex items-center gap-2.5">
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
        </div>

        {/* Center: Tab navigation (desktop) */}
        <nav className="hidden md:flex items-center gap-1 mx-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative px-3 py-2 text-sm font-medium font-body transition-colors rounded-md",
                  active
                    ? "text-[#F43F5E]"
                    : "text-[hsl(var(--muted-foreground))] hover:text-foreground"
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#F43F5E] rounded-full shadow-[0_0_6px_rgba(244,63,94,0.5)]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: UserMenu */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <UserMenu />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block px-3 py-2 text-sm font-medium font-body rounded-md transition-colors",
                  active
                    ? "text-[#F43F5E] bg-[#F43F5E]/10"
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
        </nav>
      )}
    </header>
  );
}
