"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ============================================================
// Global confirm + prompt modal — replaces the browser-native
// confirm()/alert()/prompt() dialogs.
//
// Mount <ConfirmProvider> once near the root (alongside
// <ToastProvider>); descendants get:
//
//   const confirm = useConfirm();
//   const ok = await confirm({ title, description, variant: "destructive" });
//   if (!ok) return;
//
//   const value = await prompt({ title, description, placeholder });
//   if (value === null) return; // user cancelled
//
// Each call resolves once the user clicks confirm/cancel, hits the
// close button, presses Escape, or clicks the backdrop.
// ============================================================

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

interface PromptOptions {
  title: string;
  description?: React.ReactNode;
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

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = React.createContext<ConfirmContextValue | undefined>(
  undefined,
);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState<ActiveDialog>(null);
  const [promptValue, setPromptValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const close = React.useCallback(
    (result: boolean | string | null) => {
      setActive((current) => {
        if (!current) return current;
        if (current.kind === "confirm") {
          current.resolve(typeof result === "boolean" ? result : false);
        } else {
          current.resolve(typeof result === "string" ? result : null);
        }
        return null;
      });
      setPromptValue("");
    },
    [],
  );

  const confirm = React.useCallback(
    (opts: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setActive({ kind: "confirm", opts, resolve });
      });
    },
    [],
  );

  const promptFn = React.useCallback(
    (opts: PromptOptions): Promise<string | null> => {
      return new Promise((resolve) => {
        setPromptValue(opts.defaultValue ?? "");
        setActive({ kind: "prompt", opts, resolve });
      });
    },
    [],
  );

  // Auto-focus the prompt input + close on Escape.
  React.useEffect(() => {
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

  const value = React.useMemo<ConfirmContextValue>(
    () => ({ confirm, prompt: promptFn }),
    [confirm, promptFn],
  );

  const dialog =
    active && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => close(active.kind === "confirm" ? false : null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full max-w-md bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
                <div className="flex items-start gap-2.5 min-w-0">
                  {active.kind === "confirm" &&
                    active.opts.variant === "destructive" && (
                      <span className="shrink-0 mt-0.5 flex items-center justify-center w-7 h-7 rounded-full bg-destructive/10 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                    )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">
                      {active.opts.title}
                    </p>
                    {active.opts.description && (
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {active.opts.description}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => close(active.kind === "confirm" ? false : null)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

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

              <div className="flex justify-end gap-2 px-5 py-3 bg-muted/30 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => close(active.kind === "confirm" ? false : null)}
                >
                  {active.kind === "confirm"
                    ? (active.opts.cancelLabel ?? "Cancel")
                    : "Cancel"}
                </Button>
                <Button
                  variant={
                    active.kind === "confirm" &&
                    active.opts.variant === "destructive"
                      ? "destructive"
                      : "default"
                  }
                  onClick={() =>
                    close(active.kind === "confirm" ? true : promptValue)
                  }
                >
                  {active.kind === "confirm"
                    ? (active.opts.confirmLabel ?? "Confirm")
                    : (active.opts.confirmLabel ?? "OK")}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialog}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue["confirm"] {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx)
    throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}

export function usePrompt(): ConfirmContextValue["prompt"] {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("usePrompt must be used within ConfirmProvider");
  return ctx.prompt;
}
