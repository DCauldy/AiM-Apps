"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell/AppShell";
import { PromptStudioHeader } from "@/components/prompt-studio/PromptStudioHeader";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ConversationHeader } from "@/components/chat/ConversationHeader";
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

interface ConversationContextType {
  threadId: string | null;
  threadTitle: string;
  isStarred: boolean;
  setThreadData: (data: {
    threadId: string | null;
    threadTitle: string;
    isStarred: boolean;
  }) => void;
  onRename?: (newTitle: string) => Promise<void>;
  onToggleStar?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  setHandlers: (handlers: {
    onRename?: (newTitle: string) => Promise<void>;
    onToggleStar?: () => Promise<void>;
    onDelete?: () => Promise<void>;
  }) => void;
}

const ConversationContext = createContext<ConversationContextType | null>(null);

export function useConversation() {
  const context = useContext(ConversationContext);
  return context;
}

export function PromptStudioLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // CRITICAL: Also check window.location.pathname as fallback
  // This handles cases where URL is updated with window.history.replaceState
  // but Next.js usePathname() hasn't updated yet
  const [syncPathname, setSyncPathname] = useState(pathname);

  useEffect(() => {
    // Only access window on client side
    if (typeof window === 'undefined') return;

    // Sync with window.location when pathname changes or on mount
    const currentPath = window.location.pathname;
    if (currentPath !== pathname && currentPath.startsWith('/apps/prompt-studio/chat/')) {
      setSyncPathname(currentPath);
    } else {
      setSyncPathname(pathname);
    }
  }, [pathname]);

  // Listen for custom pathname sync events (when URL is updated without Next.js navigation)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePathnameSync = () => {
      if (typeof window !== 'undefined') {
        setSyncPathname(window.location.pathname);
      }
    };

    window.addEventListener('pathname-sync', handlePathnameSync);
    return () => window.removeEventListener('pathname-sync', handlePathnameSync);
  }, []);

  const threadIdMatch = syncPathname?.match(/\/apps\/prompt-studio\/chat\/([^/]+)/);
  const activeThreadId = threadIdMatch ? threadIdMatch[1] : null;

  const [threadData, setThreadData] = useState<{
    threadId: string | null;
    threadTitle: string;
    isStarred: boolean;
  }>({
    threadId: null,
    threadTitle: "",
    isStarred: false,
  });

  const handlersRef = useRef<{
    onRename?: (newTitle: string) => Promise<void>;
    onToggleStar?: () => Promise<void>;
    onDelete?: () => Promise<void>;
  }>({});

  const setHandlers = useCallback((newHandlers: {
    onRename?: (newTitle: string) => Promise<void>;
    onToggleStar?: () => Promise<void>;
    onDelete?: () => Promise<void>;
  }) => {
    handlersRef.current = newHandlers;
  }, []);

  // Reset thread data when navigating away from a conversation
  useEffect(() => {
    if (!activeThreadId) {
      setThreadData({
        threadId: null,
        threadTitle: "",
        isStarred: false,
      });
      handlersRef.current = {};
    }
  }, [activeThreadId]);

  // Sidebar (chat thread list) is only relevant on /chat routes.
  // Other top-tabs (Library / AiM Library / Bookmarked / Stats /
  // Settings) render full-width like the other product apps.
  const showThreadSidebar = Boolean(pathname?.startsWith("/apps/prompt-studio/chat"));
  // Mobile-default-closed, desktop-default-open behavior preserved
  // from the old MainLayout.
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
    };
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  return (
    <ConversationContext.Provider
      value={{
        threadId: threadData.threadId,
        threadTitle: threadData.threadTitle,
        isStarred: threadData.isStarred,
        setThreadData,
        onRename: handlersRef.current.onRename,
        onToggleStar: handlersRef.current.onToggleStar,
        onDelete: handlersRef.current.onDelete,
        setHandlers,
      }}
    >
      <AppShell header={<PromptStudioHeader />}>
        {showThreadSidebar ? (
          <div className="flex h-full overflow-hidden">
            <Sidebar
              activeThreadId={activeThreadId}
              onThreadSelect={() => {}}
              isOpen={isSidebarOpen}
              onToggle={() => setIsSidebarOpen((v) => !v)}
            />
            {/* Match the Sidebar's mounted width so chat content
                doesn't slide under it on desktop. On mobile the
                sidebar overlays so no offset needed. */}
            <div
              className={
                isSidebarOpen
                  ? "flex-1 lg:ml-80 transition-all duration-300 min-w-0 flex flex-col overflow-hidden"
                  : "flex-1 transition-all duration-300 min-w-0 flex flex-col overflow-hidden"
              }
            >
              {/* Conversation chrome — title + star + rename +
                  delete. Lives in-page (matching how CMA's client
                  detail renders the client name inline) instead of
                  hijacking the global header. Handlers are wired
                  into the conversation context by the chat page
                  itself; the no-op fallbacks here cover the brief
                  window between mount and the chat page registering
                  its handlers. */}
              {activeThreadId && threadData.threadId && (
                <ConversationHeader
                  threadId={threadData.threadId}
                  title={threadData.threadTitle}
                  isStarred={threadData.isStarred}
                  onRename={
                    handlersRef.current.onRename ??
                    (async () => undefined)
                  }
                  onToggleStar={
                    handlersRef.current.onToggleStar ??
                    (async () => undefined)
                  }
                  onDelete={
                    handlersRef.current.onDelete ??
                    (async () => undefined)
                  }
                />
              )}
              <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
            </div>
          </div>
        ) : (
          children
        )}
      </AppShell>
    </ConversationContext.Provider>
  );
}
