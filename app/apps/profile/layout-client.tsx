"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { ProfileAppHeader } from "@/components/profile/ProfileAppHeader";

export function ProfileLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AppShell themeClassName="" header={<ProfileAppHeader />}>
      {children}
    </AppShell>
  );
}
