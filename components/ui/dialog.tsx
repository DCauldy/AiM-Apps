"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

let openDialogCount = 0;
let previousBodyOverflow: string | null = null;

function lockBodyScroll() {
  if (openDialogCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openDialogCount += 1;
}

function unlockBodyScroll() {
  if (openDialogCount === 0) {
    return;
  }

  openDialogCount -= 1;
  if (openDialogCount === 0) {
    document.body.style.overflow = previousBodyOverflow ?? "";
    previousBodyOverflow = null;
  }
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const hasScrollLock = React.useRef(false);

  React.useEffect(() => {
    if (open && !hasScrollLock.current) {
      lockBodyScroll();
      hasScrollLock.current = true;
    }

    if (!open && hasScrollLock.current) {
      unlockBodyScroll();
      hasScrollLock.current = false;
    }

    return () => {
      if (hasScrollLock.current) {
        unlockBodyScroll();
        hasScrollLock.current = false;
      }
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="product-app-theme font-body fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-4 text-foreground sm:items-center sm:p-0">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>,
    document.body
  );
}

export function DialogContent({ children, className }: DialogContentProps) {
  return (
    <div
      className={cn(
        "relative z-50 w-full max-w-lg glass-modal text-white rounded-2xl overflow-hidden flex flex-col",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between border-b border-border p-6", className)}>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-xl font-semibold", className)}>
      {children}
    </h2>
  );
}

export function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClose}
      className="h-6 w-6"
    >
      <X className="h-4 w-4" />
    </Button>
  );
}

export function DialogBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex-1 overflow-y-auto p-6", className)}>
      {children}
    </div>
  );
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-end gap-3 border-t border-border p-6", className)}>
      {children}
    </div>
  );
}
