"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { ListingStudioHeader } from "@/components/listing-studio/ListingStudioHeader";

export function ListingStudioLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      themeClassName="listing-studio-theme"
      header={<ListingStudioHeader />}
      mainClassName="overflow-auto"
    >
      {children}
    </AppShell>
  );
}
