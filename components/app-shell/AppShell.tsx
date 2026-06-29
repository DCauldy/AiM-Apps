"use client";

import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  header: ReactNode;
  themeClassName?: string;
  mainClassName?: string;
};

export function AppShell({
  children,
  header,
  themeClassName,
  mainClassName = "overflow-hidden",
}: AppShellProps) {
  return (
    // `dark` activates Tailwind's `dark:` utility prefix so legacy
    // components built with the `bg-white dark:bg-neutral-800`
    // pattern (e.g. PromptCard) render correctly inside the product
    // apps. `product-app-theme` re-binds the HSL CSS variables to
    // the shared dark palette — together they cover both styling
    // conventions.
    <div className={cn("dark product-app-theme font-body", themeClassName)}>
      <ToastProvider>
        <ConfirmProvider>
          <div className="flex flex-col h-screen overflow-hidden w-full max-w-full bg-background text-foreground">
            {header}
            <main className={`flex-1 ${mainClassName} w-full max-w-full`}>
              {children}
            </main>
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </div>
  );
}
