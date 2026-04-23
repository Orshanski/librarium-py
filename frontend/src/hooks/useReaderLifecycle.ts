import { RefObject, useEffect } from "react";
import type { EbookReaderHandle } from "../types/reader-handle";

export function useReaderLifecycle(
  readerRef: RefObject<EbookReaderHandle | null>,
  bookReady: boolean,
  resumePosition: string | number | null,
  clearResumePosition: () => void,
) {
  useEffect(() => {
    if (resumePosition == null) return;
    if (!bookReady) return;
    const reader = readerRef.current;
    if (!reader) return;
    let cancelled = false;
    void (async () => {
      try {
        await reader.performNavigation({ type: "goTo", target: resumePosition });
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
  }, [bookReady, clearResumePosition, readerRef, resumePosition]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      if (!bookReady) return;
      if (!readerRef.current?.hasRenderer()) {
        globalThis.location.reload();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [bookReady, readerRef]);
}
