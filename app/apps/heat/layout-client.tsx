"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { HeatHeader } from "@/components/heat/HeatHeader";

export function HeatLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      themeClassName="heat-theme"
      mainClassName="overflow-y-auto"
      header={<HeatHeader />}
    >
      {children}
    </AppShell>
  );
}
