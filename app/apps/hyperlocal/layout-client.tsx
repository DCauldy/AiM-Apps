"use client";

import { HyperlocalHeader } from "@/components/hyperlocal/HyperlocalHeader";
import { ToastProvider } from "@/components/ui/toast";

export function HyperlocalLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="hyperlocal-theme font-body">
      <ToastProvider>
        <div className="flex flex-col h-screen overflow-hidden w-full max-w-full bg-background text-foreground">
          <HyperlocalHeader />
          <main className="flex-1 overflow-auto w-full max-w-full">
            {children}
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
