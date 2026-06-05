"use client";

import { AppShell } from "@/components/app-shell/AppShell";
import { BlogEngineHeader } from "@/components/blog-engine/BlogEngineHeader";

export function BlogEngineLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell themeClassName="blog-engine-theme" header={<BlogEngineHeader />}>
      {children}
    </AppShell>
  );
}
