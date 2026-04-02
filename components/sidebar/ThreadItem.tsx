"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { truncate } from "@/lib/utils";
import type { Thread } from "@/types";

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function ThreadItem({
  thread,
  isActive,
  onClick,
  onDelete,
}: ThreadItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-lg p-2 cursor-pointer transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted"
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          isActive ? "text-primary-foreground" : "text-foreground"
        )}>
          {truncate(thread.title, 30)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
          isActive && "hover:bg-primary-foreground/20"
        )}
        onClick={onDelete}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

