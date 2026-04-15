import { RefObject, useEffect } from "react";

interface FoliateViewElement extends HTMLElement {
  goTo: (target: string | number) => Promise<void>;
  performNavigation?: (request: { type: "goTo"; target: string | number; persist?: boolean; allowDuringInit?: boolean }) => Promise<void>;
  renderer?: unknown;
}

export function useReaderLifecycle(
  containerRef: RefObject<HTMLDivElement | null>,
  bookReady: boolean,
  resumePosition: string | number | null,
  clearResumePosition: () => void,
) {
  useEffect(() => {
    if (resumePosition == null) return;
    if (!bookReady) return;
    const view = containerRef.current?.querySelector("foliate-view") as FoliateViewElement | null;
    if (view) {
      void (view.performNavigation
        ? view.performNavigation({ type: "goTo", target: resumePosition })
        : view.goTo(resumePosition));
      clearResumePosition();
    }
  }, [bookReady, clearResumePosition, containerRef, resumePosition]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      if (!bookReady) return;
      const view = containerRef.current?.querySelector("foliate-view") as FoliateViewElement | null;
      if (!view || !view.renderer) {
        window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [bookReady, containerRef]);
}
