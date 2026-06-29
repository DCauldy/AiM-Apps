"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, LayoutGrid, UserCircle2, MessageSquareHeart, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface WelcomeModalProps {
  /** Server-rendered: true when the modal should be open on first paint. */
  initialOpen: boolean;
  /**
   * When true the modal is a hard gate — no close button, backdrop clicks
   * don't dismiss, and the only way forward is the "Set up my profile" CTA.
   * Used on /apps when the user has no active profile (apps are unusable
   * until one exists).
   */
  mandatory?: boolean;
}

const BULLETS = [
  {
    Icon: UserCircle2,
    title: "Set up your profile first",
    body: "Your profile powers personalization across every app: brand colors, market, sender info, brokerage.",
  },
  {
    Icon: LayoutGrid,
    title: "Pick an app to get started",
    body: "Every AiM Automations tool — Blog Engine, Radar, Hyperlocal, CMA, Tours — lives on this dashboard.",
  },
  {
    Icon: MessageSquareHeart,
    title: "We're here if you need help",
    body: "Stuck on anything? Reply to any AiM email or reach out — we read every note.",
  },
];

export function WelcomeModal({ initialOpen, mandatory = false }: WelcomeModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [busy, setBusy] = useState(false);
  // Mount gate — server + first client render both produce null so the
  // portal contents (which only exist client-side via createPortal) can't
  // cause a hydration mismatch. Modal appears on the next render after
  // useEffect runs.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  // Close X also persists dismiss to DB — single-button design intent
  // is "set up profile or come back later," not "remind me tomorrow."
  // No-op when mandatory: the profile gate can't be dismissed.
  const handleDismiss = async () => {
    if (mandatory) return;
    setBusy(true);
    try {
      await fetch("/api/welcome/dismiss", { method: "POST" });
    } catch {
      // Non-fatal — modal will reappear next visit if the write failed
    }
    setOpen(false);
  };

  const handleCta = () => {
    setBusy(true);
    router.push("/apps/profile/new");
  };

  return createPortal(
    <div className="dark product-app-theme font-body fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto p-4 text-foreground sm:items-center sm:p-0">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md"
        onClick={mandatory ? undefined : handleDismiss}
      />
      <div className="relative z-[101] w-full max-w-lg glass-modal text-white rounded-2xl overflow-hidden flex flex-col pointer-events-auto animate-in fade-in zoom-in-95 duration-300">
        {!mandatory && (
          <button
            type="button"
            onClick={handleDismiss}
            disabled={busy}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 text-white/60 hover:text-white transition-colors disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Header band — teal→blue brand gradient with a twinkling AI
            sparkle sitting inline next to "Welcome". */}
        <div
          className="px-6 pt-7 pb-6"
          style={{
            background:
              "linear-gradient(135deg, rgba(28,76,138,0.18) 0%, rgba(49,219,165,0.14) 100%)",
          }}
        >
          <h2 className="text-2xl font-bold text-white leading-tight flex items-center gap-2.5">
            <Sparkles
              className="h-6 w-6 shrink-0 text-[#31DBA5] animate-twinkle"
              aria-hidden="true"
            />
            Welcome to AiM Automations 🎉
          </h2>
          <p className="mt-1.5 text-sm text-white/70 leading-relaxed">
            You just joined a platform built to put AI to work in your real
            estate marketing.{" "}
            {mandatory
              ? "Set up your profile to unlock the apps — it takes a couple of minutes."
              : "Here's how to get the most out of it."}
          </p>
        </div>

        {/* Bullets */}
        <div className="px-6 py-5 space-y-4">
          {BULLETS.map(({ Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center">
                <Icon className="h-4 w-4 text-[#31DBA5]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-0.5 text-[13px] text-white/65 leading-relaxed">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 pt-1">
          <Button
            onClick={handleCta}
            disabled={busy}
            className="w-full h-11 text-sm font-semibold text-white dark:text-white rounded-xl border-0 hover:opacity-95 transition-opacity"
            style={{
              background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
            }}
          >
            {busy ? "Loading…" : "Set up my profile"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
