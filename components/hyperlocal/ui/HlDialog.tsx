"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Styled confirm + prompt modals for Hyperlocal that replace the ugly native
 * browser dialogs. Exposed via the `useHlDialog()` hook — returns:
 *   - `confirm({ title, message, confirmLabel?, destructive? }) => Promise<boolean>`
 *   - `promptInput({ title, message, placeholder?, defaultValue? }) => Promise<string | null>`
 *   - `dialog` — JSX you render once near the top of your tree
 *
 * Each call resolves once the user clicks confirm/cancel or closes the modal.
 */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}

type ActiveDialog =
  | {
      kind: "confirm";
      opts: ConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      kind: "prompt";
      opts: PromptOptions;
      resolve: (value: string | null) => void;
    }
  | null;

export function useHlDialog() {
  const [active, setActive] = useState<ActiveDialog>(null);
  const [promptValue, setPromptValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(
    (result: boolean | string | null) => {
      if (!active) return;
      if (active.kind === "confirm") {
        active.resolve(typeof result === "boolean" ? result : false);
      } else {
        active.resolve(typeof result === "string" ? result : null);
      }
      setActive(null);
      setPromptValue("");
    },
    [active]
  );

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setActive({ kind: "confirm", opts, resolve });
      });
    },
    []
  );

  const promptInput = useCallback(
    (opts: PromptOptions): Promise<string | null> => {
      return new Promise((resolve) => {
        setPromptValue(opts.defaultValue ?? "");
        setActive({ kind: "prompt", opts, resolve });
      });
    },
    []
  );

  // Auto-focus the input + close on Escape
  useEffect(() => {
    if (!active) return;
    const focus = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(active.kind === "confirm" ? false : null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, close]);

  const dialog =
    active && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() =>
                close(active.kind === "confirm" ? false : null)
              }
            />
            {/* Modal */}
            <div
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full max-w-md bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
                <div className="flex items-start gap-2.5 min-w-0">
                  {active.kind === "confirm" &&
                    active.opts.destructive && (
                      <span className="shrink-0 mt-0.5 flex items-center justify-center w-7 h-7 rounded-full bg-destructive/10 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                    )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">
                      {active.opts.title}
                    </p>
                    {active.opts.message && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {active.opts.message}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    close(active.kind === "confirm" ? false : null)
                  }
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Prompt input */}
              {active.kind === "prompt" && (
                <div className="px-5 py-4">
                  <Input
                    ref={inputRef}
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    placeholder={active.opts.placeholder}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        close(promptValue);
                      }
                    }}
                  />
                </div>
              )}

              {/* Footer buttons */}
              <div className="flex justify-end gap-2 px-5 py-3 bg-muted/30 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() =>
                    close(active.kind === "confirm" ? false : null)
                  }
                >
                  {active.kind === "confirm"
                    ? (active.opts.cancelLabel ?? "Cancel")
                    : "Cancel"}
                </Button>
                <Button
                  onClick={() =>
                    close(
                      active.kind === "confirm" ? true : promptValue
                    )
                  }
                  className={
                    active.kind === "confirm" && active.opts.destructive
                      ? "bg-destructive hover:bg-destructive/80"
                      : "bg-[#E11D48] hover:bg-[#BE123C]"
                  }
                >
                  {active.kind === "confirm"
                    ? (active.opts.confirmLabel ?? "Confirm")
                    : (active.opts.confirmLabel ?? "OK")}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return { confirm, promptInput, dialog };
}
