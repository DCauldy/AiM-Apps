"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { HyperlocalHeader } from "@/components/hyperlocal/HyperlocalHeader";

export function HyperlocalLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      themeClassName="hyperlocal-theme"
      header={<HyperlocalHeader />}
      mainClassName="overflow-auto"
    >
      {children}
    </AppShell>
  );
}
