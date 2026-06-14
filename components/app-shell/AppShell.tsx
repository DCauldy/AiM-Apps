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
    <div className={cn("product-app-theme font-body", themeClassName)}>
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
