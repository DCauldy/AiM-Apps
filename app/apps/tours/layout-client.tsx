"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { PageFrame } from "@/components/app-shell/PagePrimitives";
import { ToursBreadcrumbsProvider } from "@/components/tours/ToursBreadcrumbsContext";
import { ToursHeader } from "@/components/tours/ToursHeader";
import { ToursQueryProvider } from "@/components/tours/ToursQueryProvider";

export function ToursLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <ToursQueryProvider>
      <ToursBreadcrumbsProvider>
        <AppShell
          themeClassName="tours-theme"
          header={<ToursHeader />}
          mainClassName="overflow-auto"
        >
          <PageFrame>{children}</PageFrame>
        </AppShell>
      </ToursBreadcrumbsProvider>
    </ToursQueryProvider>
  );
}
