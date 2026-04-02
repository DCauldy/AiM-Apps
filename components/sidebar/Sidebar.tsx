"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Sparkles, Bookmark, Library, ChevronUp, ChevronDown, LogOut, User, AlertTriangle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThreadList } from "./ThreadList";
import { useThreads } from "@/hooks/useThreads";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { UpgradeModal } from "@/components/trial/UpgradeModal";

interface SidebarProps {
  activeThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

type UsageStatus = {
  usage: number;
  limit: number;
  remaining: number;
  resetDate: string;
};

export function Sidebar({ activeThreadId, onThreadSelect, isOpen = true, onToggle }: SidebarProps) {
  const { threads, deleteThread, fetchThreads } = useThreads();
  const router = useRouter();
  const pathname = usePathname();
  const { addToast } = useToast();
  const { user, signOut } = useAuth();
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null);
  const [sharedPromptsCount, setSharedPromptsCount] = useState(0);
  const [isCheckingShared, setIsCheckingShared] = useState(false);
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user) return "U";
    const fullName = user.user_metadata?.full_name;
    if (fullName) {
      const names = fullName.trim().split(" ");
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return names[0][0].toUpperCase();
    }
    const email = user.email;
    if (email) {
      return email[0].toUpperCase();
    }
    return "U";
  };

  // Debounce function to prevent rapid successive fetches
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedFetchThreads = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchThreads();
    }, 500);
  }, [fetchThreads]);

  useEffect(() => {
    if (pathname?.startsWith("/apps/prompt-studio/chat/")) {
      debouncedFetchThreads();
    }
  }, [pathname, debouncedFetchThreads]);

  useEffect(() => {
    const handleThreadsRefresh = () => { debouncedFetchThreads(); };
    window.addEventListener('threads-refresh', handleThreadsRefresh);
    return () => {
      window.removeEventListener('threads-refresh', handleThreadsRefresh);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [debouncedFetchThreads]);

  const fetchUsageStatus = useCallback(() => {
    fetch("/api/apps/prompt-studio/trial-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setUsageStatus(data); })
      .catch(() => {});
  }, []);

  const openUpgradeModal = useCallback(() => setShowUpgradeModal(true), []);

  useEffect(() => {
    fetchUsageStatus();
    window.addEventListener("trial-usage-updated", fetchUsageStatus);
    window.addEventListener("show-upgrade-modal", openUpgradeModal);
    return () => {
      window.removeEventListener("trial-usage-updated", fetchUsageStatus);
      window.removeEventListener("show-upgrade-modal", openUpgradeModal);
    };
  }, [fetchUsageStatus, openUpgradeModal]);

  const handleNewThread = () => {
    router.push("/apps/prompt-studio/chat");
    if (window.innerWidth < 1024) onToggle?.();
  };

  const handleThreadSelect = (threadId: string) => {
    onThreadSelect(threadId);
    router.push(`/apps/prompt-studio/chat/${threadId}`);
    if (window.innerWidth < 1024) onToggle?.();
  };

  useEffect(() => {
    if (deleteDialogOpen && threadToDelete) {
      setIsCheckingShared(true);
      fetch(`/api/apps/prompt-studio/threads/${threadToDelete}`)
        .then((res) => res.json())
        .then((data) => { setSharedPromptsCount(data.sharedPromptsCount || 0); })
        .catch(() => { setSharedPromptsCount(0); })
        .finally(() => { setIsCheckingShared(false); });
    }
  }, [deleteDialogOpen, threadToDelete]);

  const handleThreadDelete = (threadId: string) => {
    setThreadToDelete(threadId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!threadToDelete) return;
    try {
      await deleteThread(threadToDelete);
      setDeleteDialogOpen(false);
      setThreadToDelete(null);
      if (activeThreadId === threadToDelete) {
        router.push("/apps/prompt-studio/chat");
      }
      addToast({ title: "Deleted", description: "Conversation deleted successfully" });
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to delete conversation",
        variant: "destructive",
      });
    }
  };

  const isLibraryActive    = pathname === "/apps/prompt-studio/library";
  const isSavedActive      = pathname === "/apps/prompt-studio/saved";
  const isAimLibraryActive = pathname === "/apps/prompt-studio/aim-library";

  return (
    <>
      {/* Sidebar */}
      <aside
        className={cn(
          "top-0 left-0 z-40 h-screen border-r bg-background flex flex-col",
          "w-[280px]",
          isOpen ? "sm:w-80" : "sm:w-64",
          "fixed transition-all duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 border-b space-y-2">
          <Button onClick={handleNewThread} className="w-full" variant="default">
            <Plus className="mr-2 h-4 w-4" />
            New Prompt
          </Button>
          <div className="flex flex-col gap-2">
            <Button
              variant={isLibraryActive ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => {
                router.push("/apps/prompt-studio/library");
                if (window.innerWidth < 1024) onToggle?.();
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Community Prompts
            </Button>
            <Button
              variant={isAimLibraryActive ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => {
                router.push("/apps/prompt-studio/aim-library");
                if (window.innerWidth < 1024) onToggle?.();
              }}
            >
              <Library className="mr-2 h-4 w-4" />
              AiM Library
            </Button>
            <Button
              variant={isSavedActive ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => {
                router.push("/apps/prompt-studio/saved");
                if (window.innerWidth < 1024) onToggle?.();
              }}
            >
              <Bookmark className="mr-2 h-4 w-4" />
              Bookmarked
            </Button>
          </div>
        </div>
        <Separator />
        <ThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          onThreadSelect={handleThreadSelect}
          onThreadDelete={handleThreadDelete}
        />

        {/* Usage indicator */}
        {usageStatus && (
          <div className="px-3 pb-2">
            <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
              {usageStatus.usage} / {usageStatus.limit} prompts used this month
            </div>
          </div>
        )}

        {/* Profile section at bottom */}
        {user && (
          <div className="mt-auto border-t">
            <div className="p-3">
              <button
                onClick={() => setIsProfileExpanded(!isProfileExpanded)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-[#1C4C8A] to-[#31DBA5] flex items-center justify-center text-white text-xs font-semibold">
                  {getUserInitials()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">
                    {user.user_metadata?.full_name || user.email?.split("@")[0] || "User"}
                  </p>
                </div>
                {isProfileExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {isProfileExpanded && (
                <div className="mt-2 pt-2 border-t space-y-1">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm"
                    onClick={() => {
                      router.push("/apps/prompt-studio/settings");
                      if (window.innerWidth < 1024) onToggle?.();
                    }}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Profile Settings
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm"
                    onClick={() => {
                      router.push("/apps/prompt-studio/stats");
                      if (window.innerWidth < 1024) onToggle?.();
                    }}
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Stats
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm"
                    onClick={signOut}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="limit"
      />

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle>Delete Conversation</DialogTitle>
              <DialogClose onClose={() => setDeleteDialogOpen(false)} />
            </div>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                Are you sure you want to delete this conversation? This action cannot be undone.
              </p>

              {isCheckingShared ? (
                <p className="text-sm text-muted-foreground">Checking for shared prompts...</p>
              ) : sharedPromptsCount > 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800">
                      This conversation contains {sharedPromptsCount} shared prompt{sharedPromptsCount > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Deleting this conversation will remove {sharedPromptsCount > 1 ? "these prompts" : "this prompt"} from the Community Prompts library.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </DialogBody>
          <div className="flex justify-end gap-3 p-6 border-t bg-muted">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
