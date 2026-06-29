"use client";

import { useState, useEffect } from "react";
import { Header } from "./Header";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { useConversation } from "@/app/apps/prompt-studio/layout-client";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
  activeThreadId?: string | null;
  onThreadSelect?: (threadId: string) => void;
}

export function MainLayout({
  children,
  activeThreadId = null,
  onThreadSelect = () => {},
}: MainLayoutProps) {
  // Sidebar closed by default on mobile, open on desktop
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const conversation = useConversation();

  useEffect(() => {
    // Set initial state based on screen size
    const checkScreenSize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden w-full max-w-full">
        <Sidebar 
          activeThreadId={activeThreadId} 
          onThreadSelect={onThreadSelect}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />
        <div className={cn(
          "flex-1 flex flex-col transition-all duration-300 min-w-0 w-full max-w-full overflow-hidden",
          // Add left margin only on desktop when sidebar is open
          // On mobile, sidebar overlays so no margin needed
          isSidebarOpen ? "lg:ml-80" : "lg:ml-0"
        )}>
          <Header 
            onSidebarToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            isSidebarOpen={isSidebarOpen}
            threadId={conversation?.threadId || null}
            threadTitle={conversation?.threadTitle || ""}
            isStarred={conversation?.isStarred}
            onRename={conversation?.onRename}
            onToggleStar={conversation?.onToggleStar}
            onDelete={conversation?.onDelete}
          />
          <main className="flex-1 overflow-hidden w-full max-w-full bg-background">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}

