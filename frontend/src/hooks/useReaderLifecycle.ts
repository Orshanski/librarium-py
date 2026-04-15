import { RefObject, useEffect } from "react";
import type { ReaderViewElement } from "../types/reader";
import { getFoliateView } from "../utils/reader-view";

export function useReaderLifecycle(
  containerRef: RefObject<HTMLDivElement | null>,
  bookReady: boolean,
  resumePosition: string | number | null,
  clearResumePosition: () => void,
) {
  useEffect(() => {
    if (resumePosition == null) return;
    if (!bookReady) return;
    const view = getFoliateView(containerRef);
    if (!view) return;
    let cancelled = false;
    void (async () => {
      try {
        await (view.performNavigation
          ? view.performNavigation({ type: "goTo", target: resumePosition })
          : view.goTo(resumePosition));
        if (!cancelled) clearResumePosition();
      } catch (err) {
        if (location.hostname === "localhost") {
          console.error("[reader] failed to apply resume position:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookReady, clearResumePosition, containerRef, resumePosition]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      if (!bookReady) return;
      const view = getFoliateView(containerRef) as ReaderViewElement | null;
      if (!view || !view.renderer) {
        window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [bookReady, containerRef]);
}
