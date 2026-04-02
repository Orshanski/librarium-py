import { useEffect, useRef, useCallback } from "react";
import { colors } from "../theme";

// Import foliate-js view (registers <foliate-view> custom element)
import "../vendor/foliate-js/view.js";

export interface ReaderCallbacks {
  onRelocate?: (detail: { fraction: number; cfi: string; tocItem?: any }) => void;
  onLoad?: () => void;
}

interface EbookReaderProps {
  bookBlob: Blob;
  initialPosition?: string | null;
  style?: React.CSSProperties;
  callbacks?: ReaderCallbacks;
}

export default function EbookReader({ bookBlob, initialPosition, style, callbacks }: EbookReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !bookBlob) return;

    const view = document.createElement("foliate-view") as any;
    view.style.width = "100%";
    view.style.height = "100%";
    container.appendChild(view);
    viewRef.current = view;

    view.addEventListener("relocate", (e: CustomEvent) => {
      const { fraction, cfi, tocItem } = e.detail;
      callbacksRef.current?.onRelocate?.({ fraction, cfi, tocItem });
    });

    view.addEventListener("load", () => {
      callbacksRef.current?.onLoad?.();
    });

    view.open(bookBlob)
      .then(() => {
        if (initialPosition) {
          view.goTo(initialPosition);
        } else {
          view.renderer.next();
        }
      })
      .catch((err: Error) => console.error("Failed to open book:", err));

    return () => {
      try { view.close(); } catch {}
      view.remove();
      viewRef.current = null;
    };
  }, [bookBlob]); // intentionally omit initialPosition — only used on first open

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: colors.bg,
        ...style,
      }}
    />
  );
}
