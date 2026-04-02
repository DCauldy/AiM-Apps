"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Star, Edit2, Trash2, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConversationHeaderProps {
  title: string;
  threadId: string;
  isStarred?: boolean;
  onRename: (newTitle: string) => Promise<void>;
  onToggleStar: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ConversationHeader({
  title,
  threadId,
  isStarred = false,
  onRename,
  onToggleStar,
  onDelete,
}: ConversationHeaderProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sharedPromptsCount, setSharedPromptsCount] = useState(0);
  const [isCheckingShared, setIsCheckingShared] = useState(false);
  const { addToast } = useToast();
  const router = useRouter();

  const handleRename = async () => {
    if (!newTitle.trim()) {
      addToast({
        title: "Error",
        description: "Title cannot be empty",
        variant: "destructive",
      });
      return;
    }

    if (newTitle.trim() === title) {
      setIsRenaming(false);
      return;
    }

    try {
      await onRename(newTitle.trim());
      setIsRenaming(false);
      addToast({
        title: "Success",
        description: "Conversation renamed",
      });
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to rename conversation",
        variant: "destructive",
      });
    }
  };

  const handleToggleStar = async () => {
    const wasStarred = isStarred; // Capture current state before update
    try {
      await onToggleStar();
      // Use the opposite of what it was, since we just toggled it
      addToast({
        title: "Success",
        description: wasStarred
          ? "Unstarred"
          : "Starred",
      });
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to update starred status",
        variant: "destructive",
      });
    }
  };

  // Check for shared prompts when delete dialog opens
  useEffect(() => {
    if (isDeleteDialogOpen) {
      setIsCheckingShared(true);
      fetch(`/api/threads/${threadId}`)
        .then((res) => res.json())
        .then((data) => {
          setSharedPromptsCount(data.sharedPromptsCount || 0);
        })
        .catch(() => {
          setSharedPromptsCount(0);
        })
        .finally(() => {
          setIsCheckingShared(false);
        });
    }
  }, [isDeleteDialogOpen, threadId]);

  const handleDelete = async () => {
    try {
      await onDelete();
      setIsDeleteDialogOpen(false);
      addToast({
        title: "Success",
        description: "Conversation deleted",
      });
      router.push("/apps/prompt-studio/chat");
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to delete conversation",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center justify-center">
      {isRenaming ? (
        <div className="flex items-center gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleRename();
              } else if (e.key === "Escape") {
                setNewTitle(title);
                setIsRenaming(false);
              }
            }}
            className="text-sm sm:text-base font-medium w-[200px] sm:w-[300px]"
            autoFocus
            onBlur={handleRename}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-muted rounded-full px-3 sm:px-4 py-1.5 border border-border shadow-sm">
          <h1 className="text-sm sm:text-base font-medium text-foreground truncate max-w-[200px] sm:max-w-[400px]">
            {title}
          </h1>
          <DropdownMenu>
            <DropdownMenuTrigger className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full hover:bg-accent transition-colors ml-1">
              <ChevronDown className="h-3.5 w-3.5 text-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48" key={`dropdown-${isStarred}`}>
              <DropdownMenuItem
                onClick={() => setIsRenaming(true)}
                className="cursor-pointer"
              >
                <Edit2 className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleToggleStar}
                className="cursor-pointer"
              >
                <Star
                  className={`mr-2 h-4 w-4 ${isStarred ? "fill-current" : ""}`}
                />
                {isStarred ? "Unstar" : "Star"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsDeleteDialogOpen(true)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle>Delete Conversation</DialogTitle>
              <DialogClose onClose={() => setIsDeleteDialogOpen(false)} />
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
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

