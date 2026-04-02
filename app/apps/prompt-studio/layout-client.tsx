"use client";

import { usePathname } from "next/navigation";
import { MainLayout } from "@/components/layout/MainLayout";
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
      // If window.location shows a different path (from history.replaceState),
      // use that instead of Next.js pathname
      setSyncPathname(currentPath);
    } else {
      setSyncPathname(pathname);
    }
  }, [pathname]);
  
  // Listen for custom pathname sync events (when URL is updated without Next.js navigation)
  useEffect(() => {
    // Only access window on client side
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
    // Just store in ref - no re-render needed
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

  // Use handlersVersion to force re-render when handlers change
  // But read from ref to get latest handlers
  const handlers = handlersRef.current;

  return (
    <ConversationContext.Provider
      value={{
        threadId: threadData.threadId,
        threadTitle: threadData.threadTitle,
        isStarred: threadData.isStarred,
        setThreadData,
        onRename: handlers.onRename,
        onToggleStar: handlers.onToggleStar,
        onDelete: handlers.onDelete,
        setHandlers,
      }}
    >
      <MainLayout activeThreadId={activeThreadId} onThreadSelect={() => {}}>
        {children}
      </MainLayout>
    </ConversationContext.Provider>
  );
}
