"use client";

import { X, Sparkles, Check } from "lucide-react";

const AIM_UPGRADE_URL =
  process.env.NEXT_PUBLIC_AIM_UPGRADE_URL ||
  "https://aimarketingacademy.com/profile?aim_modal=upgrade";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** 'limit' = hit monthly cap, 'cta' = user-initiated upgrade click */
  reason?: "limit" | "cta";
  resetDate?: string;
}

const FULL_FEATURES = [
  "Unlimited Prompt Studio access",
  "150+ hours of on-demand AI marketing training",
  "Monthly strategy sessions & live labs",
  "Full prompt library & marketing templates",
  "Private community of agents & experts",
  "AI search visibility training (ChatGPT, Gemini & more)",
  "New content added every week",
];

export function UpgradeModal({ open, onClose, reason = "cta", resetDate }: UpgradeModalProps) {
  if (!open) return null;

  const resetFormatted = resetDate
    ? new Date(resetDate).toLocaleDateString([], { month: "long", day: "numeric" })
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-md rounded-2xl border bg-background shadow-2xl overflow-hidden pointer-events-auto"
          style={{ borderColor: "rgba(49,219,165,0.3)" }}
        >
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header gradient */}
          <div
            className="px-6 pt-6 pb-5"
            style={{
              background:
                "linear-gradient(135deg, rgba(28,76,138,0.08) 0%, rgba(49,219,165,0.08) 100%)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{
                background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
              }}
            >
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            {reason === "limit" ? (
              <>
                <h2 className="text-lg font-bold text-foreground">
                  Monthly limit reached
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {resetFormatted
                    ? `Your limit resets on ${resetFormatted}. Upgrade your plan for a higher monthly limit.`
                    : "You've used all your prompts for this month. Upgrade your plan for a higher monthly limit."}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-foreground">
                  The agents using AI are taking listings. Join them.
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Get unlimited Prompt Studio plus 150+ hours of training, live labs, and a private community of agents building AI-powered marketing systems.
                </p>
              </>
            )}
          </div>

          {/* Features list */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              What you get with AiM
            </p>
            <ul className="space-y-2">
              {FULL_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "#31DBA5" }} />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div className="px-6 pb-6">
            <a
              href={AIM_UPGRADE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)" }}
            >
              Upgrade Plan →
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
