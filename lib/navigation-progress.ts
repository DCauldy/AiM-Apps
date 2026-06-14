export const NAVIGATION_PROGRESS_START_EVENT = "aim:navigation-progress-start";

export function startNavigationProgress() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NAVIGATION_PROGRESS_START_EVENT));
}
