"use client";

import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  icon?: React.ReactNode;
}

/**
 * Reusable confirm-or-cancel modal. Matches the Tailwind UI alert dialog
 * pattern: icon disc on the left (red disc + alert icon for destructive,
 * neutral for default), title + description on the right, two buttons
 * in the footer (primary action + cancel).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  busy,
  icon,
}: ConfirmDialogProps) {
  const isDestructive = variant === "destructive";
  const discBg = isDestructive ? "bg-destructive/15" : "bg-primary/15";
  const iconColor = isDestructive ? "text-destructive" : "text-primary";

  async function handleConfirm() {
    await onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <div className="px-4 pt-5 pb-4 sm:p-6">
          <div className="sm:flex sm:items-start">
            <div
              className={cn(
                "mx-auto flex size-12 shrink-0 items-center justify-center rounded-full sm:mx-0 sm:size-10",
                discBg
              )}
            >
              <span className={cn("flex", iconColor)}>
                {icon ?? <AlertTriangle className="size-6" strokeWidth={1.5} />}
              </span>
            </div>
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 className="text-base font-semibold">{title}</h3>
              <div className="mt-2 text-sm text-muted-foreground">{description}</div>
            </div>
          </div>
          <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
            <Button
              type="button"
              variant={isDestructive ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              {busy ? "Working…" : confirmLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="mt-3 sm:mt-0 w-full sm:w-auto"
            >
              {cancelLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
