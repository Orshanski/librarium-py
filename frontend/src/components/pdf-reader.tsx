import { useEffect, useRef } from "react";
import { DesktopTapZones, TapAction, DEFAULT_PDF_TAP_ZONES } from "./reader-toolbar";

// Register <foliate-view> custom element
import "../vendor/foliate-js/view.js";

export interface PdfReaderCallbacks {
  onRelocate?: (detail: {
    index: number;
    total: number;
    fraction: number;
    tocItem?: { label: string; href: string };
  }) => void;
  onLoad?: () => void;
}

interface PdfReaderProps {
  bookBlob: Blob;
  initialPage?: number;
  pdfTapZones: DesktopTapZones;
  onCenterTap?: () => void;
  callbacks?: PdfReaderCallbacks;
}

type TapZoneResult = TapAction | "toolbar";

function resolveZone(xFrac: number, yFrac: number, zones: DesktopTapZones): TapZoneResult {
  if (xFrac < 0.33) {
    return yFrac < 0.5 ? zones.topLeft : zones.bottomLeft;
  }
  if (xFrac > 0.67) {
    return yFrac < 0.5 ? zones.topRight : zones.bottomRight;
  }
  if (yFrac < 0.33) return zones.topCenter;
  if (yFrac > 0.67) return zones.bottomCenter;
  return "toolbar";
}

// Zoom steps: "fit-page" (default) → 1.25 → 1.5 → 2.0 → 3.0
const ZOOM_STEPS: (string | number)[] = ["fit-page", 1.25, 1.5, 2.0, 3.0];

export default function PdfReader({ bookBlob, initialPage, pdfTapZones, onCenterTap, callbacks }: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const onCenterTapRef = useRef(onCenterTap);
  onCenterTapRef.current = onCenterTap;
  const zonesRef = useRef(pdfTapZones);
  zonesRef.current = pdfTapZones;
  const zoomStepRef = useRef(0);
  const lastClickXRef = useRef(0);
  const lastClickYRef = useRef(0);

  const applyZoom = () => {
    const view = viewRef.current;
    if (!view?.renderer) return;
    const value = ZOOM_STEPS[zoomStepRef.current];
    view.renderer.setAttribute("zoom", String(value));
  };

  const zoomIn = () => {
    zoomStepRef.current = Math.min(ZOOM_STEPS.length - 1, zoomStepRef.current + 1);
    applyZoom();
  };

  const zoomOut = () => {
    zoomStepRef.current = Math.max(0, zoomStepRef.current - 1);
    applyZoom();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !bookBlob) return;

    const view = document.createElement("foliate-view") as any;
    view.style.width = "100%";
    view.style.height = "100%";
    container.appendChild(view);
    viewRef.current = view;

    view.addEventListener("relocate", (e: CustomEvent) => {
      const { section, fraction, tocItem } = e.detail;
      callbacksRef.current?.onRelocate?.({
        index: section?.current ?? 0,
        total: section?.total ?? 0,
        fraction: typeof fraction === "number" ? fraction : 0,
        tocItem,
      });
    });

    view.addEventListener("load", (e: CustomEvent) => {
      callbacksRef.current?.onLoad?.();
      const doc = e.detail?.doc;
      if (doc) {
        // Capture click position for zone resolution
        doc.addEventListener("click", (ev: MouseEvent) => {
          lastClickXRef.current = ev.screenX - window.screenX;
          lastClickYRef.current = ev.screenY - window.screenY;
        }, true);
        doc.addEventListener("click", (ev: MouseEvent) => {
          if ((ev.target as Element)?.closest?.("a[href]")) return; // links handled by foliate
          const rect = container.getBoundingClientRect();
          const xFrac = (lastClickXRef.current - rect.left) / rect.width;
          const yFrac = (lastClickYRef.current - rect.top) / rect.height;
          const action = resolveZone(xFrac, yFrac, zonesRef.current);
          if (action === "prev") view.prev();
          else if (action === "next") view.next();
          else if (action === "zoom_in") zoomIn();
          else if (action === "zoom_out") zoomOut();
          else if (action === "toolbar") onCenterTapRef.current?.();
        });
      }
    });

    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") view.prev();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") view.next();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
    };
    document.addEventListener("keydown", handleKeyDown);

    let disposed = false;
    view.open(bookBlob)
      .then(async () => {
        if (disposed) return;
        // Initial zoom — fit-page
        applyZoom();
        // Navigate to initial page
        if (typeof initialPage === "number" && initialPage >= 0) {
          view.goTo(initialPage);
        } else {
          view.renderer.next();
        }
      })
      .catch((err: Error) => console.error("Failed to open PDF:", err));

    return () => {
      disposed = true;
      document.removeEventListener("keydown", handleKeyDown);
      try { view.renderer?.destroy(); } catch {}
      try { view.close(); } catch {}
      view.remove();
      viewRef.current = null;
    };
  }, [bookBlob]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#2a2a2a",
      }}
    />
  );
}

export { DEFAULT_PDF_TAP_ZONES };
