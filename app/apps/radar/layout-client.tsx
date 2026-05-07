"use client";

import { RadarHeader } from "@/components/radar/RadarHeader";
import { ToastProvider } from "@/components/ui/toast";

export function RadarLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="radar-theme font-body">
      <ToastProvider>
        <div className="flex flex-col h-screen overflow-hidden w-full max-w-full bg-background text-foreground">
          <RadarHeader />
          <main className="flex-1 overflow-hidden w-full max-w-full">
            {children}
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
