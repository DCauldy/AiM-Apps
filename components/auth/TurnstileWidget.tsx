"use client";

import { useEffect, useRef } from "react";

// Cloudflare's official test site key — always passes, works on any hostname
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

function getSiteKey(): string | null {
  const configuredKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!configuredKey) return null;

  // Use test keys on localhost to avoid hostname-mismatch errors
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return TURNSTILE_TEST_SITE_KEY;
  }

  return configuredKey;
}

export function TurnstileWidget({ onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const siteKey = getSiteKey();
    if (!siteKey) return;

    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile) return;
      // Clear any previous widget
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        "expired-callback": onExpire,
        theme: "auto",
      });
    };

    // If script is already loaded
    if (window.turnstile) {
      renderWidget();
      return;
    }

    // Load the Turnstile script
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = renderWidget;
    document.head.appendChild(script);

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [onVerify, onExpire]);

  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    return null;
  }

  return <div ref={containerRef} className="flex justify-center" />;
}
