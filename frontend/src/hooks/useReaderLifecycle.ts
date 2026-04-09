import { RefObject, useEffect } from "react";

interface FoliateViewElement extends HTMLElement {
  goTo: (target: string | number) => void;
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
      view.goTo(resumePosition);
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
