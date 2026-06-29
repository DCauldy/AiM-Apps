"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { ProfileAppHeader } from "@/components/profile/ProfileAppHeader";

export function ProfileLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AppShell themeClassName="profile-theme" header={<ProfileAppHeader />} mainClassName="overflow-y-auto">
      {children}
    </AppShell>
  );
}
