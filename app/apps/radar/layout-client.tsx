"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { RadarHeader } from "@/components/radar-otterly/RadarHeader";

export function RadarLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell themeClassName="radar-theme" header={<RadarHeader />}>
      {children}
    </AppShell>
  );
}
