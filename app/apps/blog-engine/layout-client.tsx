"use client";

import { BlogEngineHeader } from "@/components/blog-engine/BlogEngineHeader";
import { ToastProvider } from "@/components/ui/toast";

export function BlogEngineLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="blog-engine-theme font-body">
      <ToastProvider>
        <div className="flex flex-col h-screen overflow-hidden w-full max-w-full bg-background text-foreground">
          <BlogEngineHeader />
          <main className="flex-1 overflow-hidden w-full max-w-full">
            {children}
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
