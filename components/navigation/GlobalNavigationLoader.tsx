"use client";

import { useEffect, useRef } from "react";
import NProgress from "nprogress";
import { usePathname, useSearchParams } from "next/navigation";
import { NAVIGATION_PROGRESS_START_EVENT } from "@/lib/navigation-progress";

const NAVIGATION_TIMEOUT_MS = 10000;

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function shouldShowNavigationLoader(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  const currentUrl = new URL(window.location.href);

  if (nextUrl.origin !== currentUrl.origin) return false;
  return nextUrl.pathname !== currentUrl.pathname || nextUrl.search !== currentUrl.search;
}

export function GlobalNavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    NProgress.configure({
      minimum: 0.18,
      showSpinner: false,
      trickleSpeed: 120,
    });
  }, []);

  useEffect(() => {
    NProgress.done();
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function stopNavigationLoader() {
      NProgress.done();
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    function startNavigationLoader() {
      NProgress.start();

      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(stopNavigationLoader, NAVIGATION_TIMEOUT_MS);
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || isModifiedClick(event)) return;

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!shouldShowNavigationLoader(anchor)) return;

      startNavigationLoader();
    }

    document.addEventListener("click", handleClick, { capture: true });
    window.addEventListener(NAVIGATION_PROGRESS_START_EVENT, startNavigationLoader);
    window.addEventListener("popstate", startNavigationLoader);
    window.addEventListener("pagehide", stopNavigationLoader);
    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener(NAVIGATION_PROGRESS_START_EVENT, startNavigationLoader);
      window.removeEventListener("popstate", startNavigationLoader);
      window.removeEventListener("pagehide", stopNavigationLoader);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      NProgress.done();
    };
  }, []);

  return (
    <>
      <style>{`
        #nprogress {
          pointer-events: none;
        }

        #nprogress .bar {
          background: #31DBA5;
          height: 3px;
          left: 0;
          position: fixed;
          top: 0;
          width: 100%;
          z-index: 2147483647;
        }

        #nprogress .peg {
          box-shadow: 0 0 12px #31DBA5, 0 0 6px #31DBA5;
          display: block;
          height: 100%;
          opacity: 1;
          position: absolute;
          right: 0;
          transform: rotate(3deg) translate(0, -4px);
          width: 100px;
        }
      `}</style>
    </>
  );
}
