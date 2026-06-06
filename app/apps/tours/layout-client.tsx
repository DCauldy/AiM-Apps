"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { ToursHeader } from "@/components/tours/ToursHeader";
import { ToursQueryProvider } from "@/components/tours/ToursQueryProvider";

export function ToursLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <ToursQueryProvider>
      <AppShell
        themeClassName="tours-theme"
        header={<ToursHeader />}
        mainClassName="overflow-auto"
      >
        {children}
      </AppShell>
    </ToursQueryProvider>
  );
}
