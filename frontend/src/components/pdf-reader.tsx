import { useEffect, useRef } from "react";
import type { DesktopTapZones } from "../types/reader-settings";
import { resolveDesktopZone } from "../utils/reader-input";

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
    /** 0-based page index — the same units goTo()/initialPage take. */
    index: number;
    /** Page count — the last index is total - 1. */
    total: number;
    /** Share of the book read, counted to the end of the current page. */
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
  /** 0-based page index, as reported by onRelocate. */
  initialPage?: number;
  pdfTapZones: DesktopTapZones;
  onCenterTap?: () => void;
  callbacks?: PdfReaderCallbacks;
}


// Zoom steps: "fit-page" (default) → 1.25 → 1.5 → 2 → 3
const ZOOM_STEPS = ["fit-page", 1.25, 1.5, 2, 3] as const;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // jsdom may report undefined for elements without contenteditable, so coerce.
  return target.isContentEditable === true;
}

/**
 * Translate a click/touch coordinate (relative to the iframe viewport) into
 * tap-zone fractions of the host container. iframeRect is the iframe's bounding
 * box in the host document; null/undefined means "no offset" (e.g. click landed
 * directly on the host doc, not inside the iframe).
 */
function computeTapFractions(
  clientX: number,
  clientY: number,
  iframeRect: { left: number; top: number } | null | undefined,
  containerRect: { left: number; top: number; width: number; height: number },
): { xFrac: number; yFrac: number } {
  const x = clientX + (iframeRect?.left ?? 0);
  const y = clientY + (iframeRect?.top ?? 0);
  return {
    xFrac: (x - containerRect.left) / containerRect.width,
    yFrac: (y - containerRect.top) / containerRect.height,
  };
}

export interface PdfInputListenersOptions {
  doc: Document;
  container: HTMLElement;
  view: FoliateView;
  zonesRef: { current: DesktopTapZones };
  onCenterTap: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

/**
 * Attaches click/touch listeners on the foliate iframe document. Listeners die
 * with the iframe when the view is closed, so no explicit cleanup is needed.
 * Pulled out of useEffect so the body of "load" stays flat (S2004) and the
 * touch/click state lives in a tight closure instead of leaking refs into the
 * component scope.
 */
export function attachPdfInputListeners({
  doc, container, view, zonesRef, onCenterTap, zoomIn, zoomOut,
}: PdfInputListenersOptions): void {
  let touchActive = false;
  let touchActiveTimer: ReturnType<typeof setTimeout> | undefined;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;
  let lastClickX = 0;
  let lastClickY = 0;

  const performZoneAction = (action: ReturnType<typeof resolveDesktopZone>): void => {
    if (action === "prev") view.prev();
    else if (action === "next") view.next();
    else if (action === "zoom_in") zoomIn();
    else if (action === "zoom_out") zoomOut();
    else if (action === "toolbar") onCenterTap();
  };

  // pageX/Y in the iframe doc are viewport-relative to the iframe; translate
  // to host coords so the bubble-phase click handler doesn't have to.
  doc.addEventListener("click", (mev) => {
    const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
    const iframeRect = iframe?.getBoundingClientRect();
    lastClickX = mev.clientX + (iframeRect?.left ?? 0);
    lastClickY = mev.clientY + (iframeRect?.top ?? 0);
  }, true);

  doc.addEventListener("click", (mev) => {
    if (touchActive) return; // touch path handled via touchend pseudo-tap
    if ((mev.target as Element)?.closest?.("a[href]")) return;
    const rect = container.getBoundingClientRect();
    // Click was already converted to host-doc coords via the capture-phase
    // listener above; iframeRect=null means "no extra offset to add".
    const { xFrac, yFrac } = computeTapFractions(lastClickX, lastClickY, null, rect);
    performZoneAction(resolveDesktopZone(xFrac, yFrac, zonesRef.current));
  });

  const fireTapZone = (clientX: number, clientY: number) => {
    const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
    const iframeRect = iframe?.getBoundingClientRect() ?? null;
    const rect = container.getBoundingClientRect();
    const { xFrac, yFrac } = computeTapFractions(clientX, clientY, iframeRect, rect);
    performZoneAction(resolveDesktopZone(xFrac, yFrac, zonesRef.current));
  };

  doc.addEventListener("touchstart", (tev) => {
    if (touchActiveTimer) {
      clearTimeout(touchActiveTimer);
      touchActiveTimer = undefined;
    }
    touchActive = true;
    if (tev.touches.length !== 1) {
      touchMoved = true; // multi-touch — not a tap
      return;
    }
    touchMoved = false;
    touchStartX = tev.touches[0].screenX;
    touchStartY = tev.touches[0].screenY;
  }, { passive: true, capture: true });

  doc.addEventListener("touchmove", (tev) => {
    if (touchMoved) return;
    if (tev.touches.length !== 1) { touchMoved = true; return; }
    const t = tev.touches[0];
    if (Math.abs(t.screenX - touchStartX) > 10 ||
        Math.abs(t.screenY - touchStartY) > 10) {
      touchMoved = true;
    }
  }, { passive: true, capture: true });

  doc.addEventListener("touchend", (tev) => {
    if (!touchMoved && tev.changedTouches.length === 1 && tev.touches.length === 0) {
      const t = tev.changedTouches[0];
      // For links, let foliate handle navigation via its own click path —
      // touchActive is still true, so the click tap-zone handler will skip.
      if (!(t.target as Element | null)?.closest?.("a[href]")) {
        fireTapZone(t.clientX, t.clientY);
      }
    }
    if (touchActiveTimer) clearTimeout(touchActiveTimer);
    touchActiveTimer = setTimeout(() => {
      touchActive = false;
      touchActiveTimer = undefined;
    }, 500);
  }, { passive: true });

  doc.addEventListener("touchcancel", () => {
    if (touchActiveTimer) {
      clearTimeout(touchActiveTimer);
      touchActiveTimer = undefined;
    }
    touchActive = false;
    touchMoved = true;
  }, { passive: true });
}

export interface PdfKeyboardHandlers {
  prev: () => void;
  next: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

/**
 * Attaches a keydown listener that drives PDF navigation/zoom. Used both on the
 * host document and on the iframe document (keydown does not bubble out of the
 * iframe in Chrome). Returns a detach function for the caller to call on
 * cleanup; iframe-side calls can ignore it (iframe dies with the view).
 */
export function attachPdfKeyboardListener(
  target: Document | HTMLElement,
  handlers: PdfKeyboardHandlers,
): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return;
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") handlers.prev();
    else if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown") handlers.next();
    else if (k === "+" || k === "=") handlers.zoomIn();
    else if (k === "-") handlers.zoomOut();
  };
  target.addEventListener("keydown", onKey as EventListener);
  return () => target.removeEventListener("keydown", onKey as EventListener);
}

export default function PdfReader({ bookBlob, initialPage, pdfTapZones, onCenterTap, callbacks }: Readonly<PdfReaderProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const onCenterTapRef = useRef(onCenterTap);
  onCenterTapRef.current = onCenterTap;
  const zonesRef = useRef(pdfTapZones);
  zonesRef.current = pdfTapZones;
  const zoomStepRef = useRef(0);
  const lastPageRef = useRef<number | null>(null);

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

    const keyboardHandlers: PdfKeyboardHandlers = {
      prev: () => view.prev(),
      next: () => view.next(),
      zoomIn,
      zoomOut,
    };

    view.addEventListener("relocate", (ev) => {
      if (disposed) return;
      const { section, fraction, tocItem } = (ev as CustomEvent<RelocateDetail>).detail;
      if (!section || typeof section.current !== "number") return;
      // section.current counts pages from one (progress.js — every PDF page is
      // counted, see pdf.js `size: 1000`, and its sections carry no cover/opening
      // flag that would zero it out), while goTo() and PdfNavBar expect an index
      // counting from zero. Convert here so the number this component reports is
      // the same number it accepts back as initialPage — otherwise each reopen
      // resumes a page further than where the reader stopped.
      const pageIndex = section.current - 1;
      // Filter re-relocates on the same page (e.g., zoom-triggered)
      if (lastPageRef.current === pageIndex) return;
      lastPageRef.current = pageIndex;
      callbacksRef.current?.onRelocate?.({
        index: pageIndex,
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
      attachPdfInputListeners({
        doc, container, view, zonesRef,
        onCenterTap: () => onCenterTapRef.current?.(),
        zoomIn, zoomOut,
      });
      // keydown из iframe не всплывает — подписываемся и внутри iframe doc.
      // Cleanup не нужен: iframe doc умирает вместе с view.
      attachPdfKeyboardListener(doc, keyboardHandlers);
    });

    const detachHostKeyboard = attachPdfKeyboardListener(document, keyboardHandlers);

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
      detachHostKeyboard();
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
