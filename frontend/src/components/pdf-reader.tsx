import { useEffect, useRef } from "react";
import { DesktopTapZones, TapAction, DEFAULT_PDF_TAP_ZONES } from "./reader-toolbar";

// Register <foliate-view> custom element
import "../vendor/foliate-js/view.js";

// Minimal subset of foliate-view API used by this component.
interface FoliateBook {
  sections?: unknown[];
  toc?: unknown;
}
interface FoliateRenderer {
  setAttribute: (name: string, value: string) => void;
  destroy?: () => void;
}
interface FoliateView extends HTMLElement {
  renderer: FoliateRenderer;
  book: FoliateBook;
  open: (blob: Blob | File) => Promise<void>;
  close: () => void;
  goTo: (target: number | string) => Promise<void>;
  prev: () => Promise<void>;
  next: () => Promise<void>;
}

interface RelocateDetail {
  section?: { current: number; total: number };
  fraction?: number;
  tocItem?: { label: string; href: string };
}
interface LoadDetail {
  doc?: Document;
}

export interface PdfReaderCallbacks {
  onRelocate?: (detail: {
    index: number;
    total: number;
    fraction: number;
    tocItem?: { label: string; href: string };
  }) => void;
  onLoad?: (view: {
    goTo: (href: string) => void;
    goToPage: (index: number) => void;
    getToc: () => unknown;
  }) => void;
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
const ZOOM_STEPS = ["fit-page", 1.25, 1.5, 2.0, 3.0] as const;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export default function PdfReader({ bookBlob, initialPage, pdfTapZones, onCenterTap, callbacks }: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const onCenterTapRef = useRef(onCenterTap);
  onCenterTapRef.current = onCenterTap;
  const zonesRef = useRef(pdfTapZones);
  zonesRef.current = pdfTapZones;
  const zoomStepRef = useRef(0);
  const lastClickXRef = useRef(0);
  const lastClickYRef = useRef(0);
  const lastPageRef = useRef<number | null>(null);
  // Touch-origin guard: true during a touch and for 500ms after touchend,
  // so the iOS-synthesised click is ignored by the click tap-zone handler.
  // Real taps are handled directly from our own touchend below.
  const touchActiveRef = useRef(false);
  const touchActiveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Tracks a single-finger touch for pseudo-tap detection inside touchend.
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchMovedRef = useRef(false);

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

    const view = document.createElement("foliate-view") as FoliateView;
    view.style.width = "100%";
    view.style.height = "100%";
    container.appendChild(view);
    viewRef.current = view;

    let disposed = false;

    view.addEventListener("relocate", (ev) => {
      if (disposed) return;
      const { section, fraction, tocItem } = (ev as CustomEvent<RelocateDetail>).detail;
      if (!section || typeof section.current !== "number") return;
      // Filter re-relocates on the same page (e.g., zoom-triggered)
      if (lastPageRef.current === section.current) return;
      lastPageRef.current = section.current;
      callbacksRef.current?.onRelocate?.({
        index: section.current,
        total: section.total,
        fraction: typeof fraction === "number" ? fraction : 0,
        tocItem,
      });
    });

    let loadedOnce = false;
    view.addEventListener("load", (ev) => {
      if (disposed) return;
      if (!loadedOnce) {
        loadedOnce = true;
        callbacksRef.current?.onLoad?.({
          goTo: (href) => { view.goTo(href); },
          goToPage: (index) => { view.goTo(index); },
          getToc: () => view.book?.toc,
        });
      }
      const doc = (ev as CustomEvent<LoadDetail>).detail?.doc;
      if (!doc) return;
      // Capture click position (pageX/Y на iframe doc соответствуют viewport iframe;
      // складываем с прямоугольником iframe внутри документа-хоста)
      doc.addEventListener("click", (mev) => {
        const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
        const iframeRect = iframe?.getBoundingClientRect();
        const offsetX = iframeRect?.left ?? 0;
        const offsetY = iframeRect?.top ?? 0;
        lastClickXRef.current = mev.clientX + offsetX;
        lastClickYRef.current = mev.clientY + offsetY;
      }, true);
      doc.addEventListener("click", (mev) => {
        if (touchActiveRef.current) return; // touch path handled via touchend pseudo-tap
        if ((mev.target as Element)?.closest?.("a[href]")) return;
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
      // Touch path. The browser click that follows a touch is swallowed by
      // touchActiveRef above; real tap-zone work happens here from touchend.
      const fireTapZone = (clientX: number, clientY: number) => {
        const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
        const iframeRect = iframe?.getBoundingClientRect();
        const x = clientX + (iframeRect?.left ?? 0);
        const y = clientY + (iframeRect?.top ?? 0);
        const rect = container.getBoundingClientRect();
        const xFrac = (x - rect.left) / rect.width;
        const yFrac = (y - rect.top) / rect.height;
        const action = resolveZone(xFrac, yFrac, zonesRef.current);
        if (action === "prev") view.prev();
        else if (action === "next") view.next();
        else if (action === "zoom_in") zoomIn();
        else if (action === "zoom_out") zoomOut();
        else if (action === "toolbar") onCenterTapRef.current?.();
      };
      doc.addEventListener("touchstart", (tev) => {
        if (touchActiveTimerRef.current) {
          clearTimeout(touchActiveTimerRef.current);
          touchActiveTimerRef.current = undefined;
        }
        touchActiveRef.current = true;
        if (tev.touches.length !== 1) {
          touchMovedRef.current = true; // multi-touch — not a tap
          return;
        }
        touchMovedRef.current = false;
        touchStartXRef.current = tev.touches[0].screenX;
        touchStartYRef.current = tev.touches[0].screenY;
      }, { passive: true, capture: true });
      doc.addEventListener("touchmove", (tev) => {
        if (touchMovedRef.current) return;
        if (tev.touches.length !== 1) { touchMovedRef.current = true; return; }
        const t = tev.touches[0];
        if (Math.abs(t.screenX - touchStartXRef.current) > 10 ||
            Math.abs(t.screenY - touchStartYRef.current) > 10) {
          touchMovedRef.current = true;
        }
      }, { passive: true, capture: true });
      doc.addEventListener("touchend", (tev) => {
        if (!touchMovedRef.current && tev.changedTouches.length === 1 && tev.touches.length === 0) {
          const t = tev.changedTouches[0];
          if ((t.target as Element | null)?.closest?.("a[href]")) {
            // Let foliate handle link navigation via its own click path —
            // touchActiveRef will still swallow the click tap-zone handler.
          } else {
            fireTapZone(t.clientX, t.clientY);
          }
        }
        if (touchActiveTimerRef.current) clearTimeout(touchActiveTimerRef.current);
        touchActiveTimerRef.current = setTimeout(() => {
          touchActiveRef.current = false;
          touchActiveTimerRef.current = undefined;
        }, 500);
      }, { passive: true });
      doc.addEventListener("touchcancel", () => {
        if (touchActiveTimerRef.current) {
          clearTimeout(touchActiveTimerRef.current);
          touchActiveTimerRef.current = undefined;
        }
        touchActiveRef.current = false;
        touchMovedRef.current = true;
      }, { passive: true });
      // keydown из iframe не всплывает — подписываемся и внутри iframe doc
      doc.addEventListener("keydown", handleKeyDown);
    });

    // Keyboard navigation (ignore when typing in inputs)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") view.prev();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") view.next();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
    };
    document.addEventListener("keydown", handleKeyDown);

    view.open(bookBlob)
      .then(async () => {
        if (disposed) return;
        // Apply zoom only if user picked non-default step (default "fit-page" is
        // foliate's fallback — avoid triggering a second #render via setAttribute).
        if (zoomStepRef.current > 0) applyZoom();
        // Navigate to initial page (or page 0)
        const target = typeof initialPage === "number" && initialPage >= 0 ? initialPage : 0;
        await view.goTo(target);
      })
      .catch((err: Error) => console.error("Failed to open PDF:", err));

    return () => {
      disposed = true;
      if (touchActiveTimerRef.current) {
        clearTimeout(touchActiveTimerRef.current);
        touchActiveTimerRef.current = undefined;
      }
      document.removeEventListener("keydown", handleKeyDown);
      try { view.close(); } catch {
        // view.close() already calls renderer.destroy() and .remove() internally
      }
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
