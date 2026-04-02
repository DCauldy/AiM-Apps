"use client";

import { useMemo } from "react";
import { ThreadItem } from "./ThreadItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Thread } from "@/types";

interface ThreadListProps {
  threads: Thread[];
  activeThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
  onThreadDelete: (threadId: string) => void;
}

export function ThreadList({
  threads,
  activeThreadId,
  onThreadSelect,
  onThreadDelete,
}: ThreadListProps) {
  // Separate starred and regular threads, maintaining order by updated_at (most recent first)
  const { starredThreads, regularThreads } = useMemo(() => {
    const starred: Thread[] = [];
    const regular: Thread[] = [];
    
    threads.forEach((thread) => {
      if (thread.starred) {
        starred.push(thread);
      } else {
        regular.push(thread);
      }
    });
    
    // Explicitly sort both arrays by updated_at descending (most recent first)
    // This ensures correct ordering even if API order changes
    const sortByUpdatedAt = (a: Thread, b: Thread) => {
      const aTime = new Date(a.updated_at).getTime();
      const bTime = new Date(b.updated_at).getTime();
      return bTime - aTime; // Descending order
    };
    
    starred.sort(sortByUpdatedAt);
    regular.sort(sortByUpdatedAt);
    
    return { starredThreads: starred, regularThreads: regular };
  }, [threads]);

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-4 p-2">
        {/* Starred Section */}
        {starredThreads.length > 0 && (
          <div className="space-y-1">
            <h3 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Starred
            </h3>
            {starredThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={activeThreadId === thread.id}
                onClick={() => onThreadSelect(thread.id)}
                onDelete={(e) => {
                  e.stopPropagation();
                  onThreadDelete(thread.id);
                }}
              />
            ))}
          </div>
        )}

        {/* Recents Section */}
        {regularThreads.length > 0 && (
          <div className="space-y-1">
            <h3 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Recents
            </h3>
            {regularThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={activeThreadId === thread.id}
                onClick={() => onThreadSelect(thread.id)}
                onDelete={(e) => {
                  e.stopPropagation();
                  onThreadDelete(thread.id);
                }}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {threads.length === 0 && (
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">
            No conversations yet. Start a new chat!
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

