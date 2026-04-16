import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import FootnotePopup from "./FootnotePopup";
import type { ReaderSettings } from "../types/reader-settings";
import { THEME_STYLES } from "../constants/reader-theme";
import { applySettings } from "../utils/reader-styling";
import { addCustomEventListener } from "../utils/reader-input";
import { attachFootnoteHandler, setupFootnoteDocListeners } from "../utils/reader-footnote-handler";
import { createNavigationController } from "../utils/reader-navigation";
import { attachReaderInteraction } from "../utils/reader-interaction";
import { useReaderFooter } from "../hooks/useReaderFooter";
import type { ReaderLoadDetail } from "../types/reader-events";
import type { EbookReaderHandle, ReaderNavigationRequest, ReaderRelocateDetail } from "../types/reader-handle";
import type { ReaderViewElement } from "../types/reader-foliate";

// Import foliate-js view (registers <foliate-view> custom element)
import "../vendor/foliate-js/view.js";

/**
 * `onReady` fires once content is loaded and the initial navigation has completed.
 * `onRelocate` is UI-only and follows foliate location changes.
 * `onSavePosition` is persistence-only and runs after explicit navigation/pagehide.
 */
export interface ReaderCallbacks {
  onRelocate?: (detail: ReaderRelocateDetail) => void;
  onReady?: () => void;
  onSavePosition?: (cfi: string, fraction: number) => void;
}

interface EbookReaderProps {
  bookBlob: Blob;
  initialPosition?: string | null;
  settings: ReaderSettings;
  onCenterTap?: () => void;
  callbacks?: ReaderCallbacks;
  maxInlineSize?: string;
  gap?: string;
  showFooter?: boolean;
  margin?: string;
  maxBlockSize?: string;
  isMobile?: boolean;
}


const EbookReader = forwardRef<EbookReaderHandle, EbookReaderProps>(function EbookReader(
  { bookBlob, initialPosition, settings, onCenterTap, callbacks, maxInlineSize = "1000px", gap = "5%", margin, maxBlockSize, showFooter = true, isMobile = false }: EbookReaderProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ReaderViewElement | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const onCenterTapRef = useRef(onCenterTap);
  onCenterTapRef.current = onCenterTap;
  const settingsRef = useRef(settings);
  const configRef = useRef({ maxInlineSize, gap, margin, maxBlockSize, showFooter, isMobile });
  const performNavigationRef = useRef<(request: ReaderNavigationRequest) => Promise<void>>(async () => {});
  const [footnoteHtml, setFootnoteHtml] = useState<string | null>(null);
  const [footnoteSide, setFootnoteSide] = useState<"left" | "right">("left");
  const lastClickXRef = useRef(0);
  const lastClickYRef = useRef(0);
  const footnoteOpenRef = useRef(false);
  const footer = useReaderFooter(containerRef, settingsRef, configRef);

  // Apply settings when they change
  useEffect(() => {
    settingsRef.current = settings;
    configRef.current = { maxInlineSize, gap, margin, maxBlockSize, showFooter, isMobile };
    const view = viewRef.current;
    if (!view?.renderer) return;
    // Apply CSS variables to current document
    const contents = view.renderer.getContents?.();
    if (contents?.length) {
      for (const { doc } of contents) {
        if (doc) applySettings(doc, settings, view.renderer);
      }
    }
    // Layout attributes
    view.renderer.setAttribute("flow", settings.flow);
    view.renderer.setAttribute("max-inline-size", configRef.current.maxInlineSize);
    view.renderer.setAttribute("gap", configRef.current.gap);
    if (configRef.current.margin) view.renderer.setAttribute("margin", configRef.current.margin);
    if (configRef.current.maxBlockSize) view.renderer.setAttribute("max-block-size", configRef.current.maxBlockSize);
    footer.recalcPages();
  }, [settings, gap, isMobile, margin, maxBlockSize, maxInlineSize, showFooter]);

  // Empty deps: all methods access via stable refs, no need to recreate handle.
  useImperativeHandle(ref, () => ({
    getToc: () => viewRef.current?.book?.toc ?? [],
    hasRenderer: () => Boolean(viewRef.current?.renderer),
    performNavigation: (request: ReaderNavigationRequest) => performNavigationRef.current(request),
  }), []);

  // Reader instance is recreated only when the book blob changes; runtime config is read from refs.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !bookBlob) return;

    const view = document.createElement("foliate-view") as ReaderViewElement;
    view.style.width = "100%";
    view.style.height = "100%";
    container.appendChild(view);
    viewRef.current = view;
    let disposed = false;
    const disposedRef = { current: false };

    const nav = createNavigationController(view, {
      onSavePosition: () => {
        const loc = view.lastLocation;
        if (loc?.cfi) callbacksRef.current?.onSavePosition?.(loc.cfi, loc.fraction ?? 0);
      },
      onReady: () => callbacksRef.current?.onReady?.(),
      isDisposed: () => disposed,
    });

    performNavigationRef.current = nav.performNavigation;

    const cleanupInteraction = attachReaderInteraction(view, container, nav, configRef, {
      onCenterTap: () => onCenterTapRef.current?.(),
      isFootnoteOpen: () => footnoteOpenRef.current,
      onDismissFootnote: () => { setFootnoteHtml(null); footnoteOpenRef.current = false; },
      getSettings: () => settingsRef.current,
    });

    const removeRelocateListener = addCustomEventListener<ReaderRelocateDetail>(view, "relocate", (e) => {
      const { fraction, cfi, tocItem, location } = e.detail;
      callbacksRef.current?.onRelocate?.({ fraction, cfi, tocItem, location });
      footer.updateFooter(fraction, tocItem, view.renderer?.feet);
    });

    const removeLoadListener = addCustomEventListener<ReaderLoadDetail>(view, "load", (e) => {
      nav.setContentLoaded();
      const doc = e.detail?.doc;
      if (doc) {
        // Apply user settings to new document
        applySettings(doc, settingsRef.current, view.renderer);
        setupFootnoteDocListeners(doc, lastClickXRef, lastClickYRef);
      }
    });

    const removeLinkListener = attachFootnoteHandler(view, container, {
      setFootnoteHtml,
      setFootnoteSide,
      setFootnoteOpen: (open) => { footnoteOpenRef.current = open; },
      lastClickXRef,
    });

    // Resize handler: recalculate pages on window resize
    const handleResize = () => footer.recalcPages();
    window.addEventListener("resize", handleResize);

    // Save position on suspend/hide — covers scroll mode where there are no tap events.
    // keepalive: true (set in pushProgressToServer) ensures the server PUT survives pagehide.
    const handlePageHide = () => nav.savePosition();
    window.addEventListener("pagehide", handlePageHide);

    const t0 = performance.now();
    view.open(bookBlob)
      .then(async () => {
        if (disposed) return;
        const book = view.book;
        const renderer = view.renderer;
        if (!book || !renderer) return;
        if (location.hostname === "localhost") console.log(`[reader] open: ${Math.round(performance.now() - t0)}ms, sections: ${book.sections.length}`);
        renderer.setAttribute("flow", settingsRef.current.flow);
        renderer.setAttribute("max-inline-size", configRef.current.maxInlineSize);
        renderer.setAttribute("gap", configRef.current.gap);
        if (configRef.current.margin) renderer.setAttribute("margin", configRef.current.margin);
        if (configRef.current.maxBlockSize) renderer.setAttribute("max-block-size", configRef.current.maxBlockSize);

        // Finish initial navigation before making the reader interactive.
        await (initialPosition
          ? nav.performNavigation({ type: "goTo", target: initialPosition, persist: false, allowDuringInit: true })
          : nav.enqueueNavigation(
            () => view.goToTextStart ? view.goToTextStart() : view.goTo(0),
            { persist: false, allowDuringInit: true },
          ));
        if (!disposed) {
          nav.setInteractive();
        }

        // Count total characters for virtual page numbers
        if (!disposed) {
          footer.startCharCount(book.sections, disposedRef);
        }
      })
      .catch((err: Error) => console.error("Failed to open book:", err));

    return () => {
      disposed = true;
      disposedRef.current = true;
      footer.cleanupCharCount();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pagehide", handlePageHide);
      removeRelocateListener();
      removeLoadListener();
      cleanupInteraction();
      removeLinkListener();
      performNavigationRef.current = async () => {};
      try { view.renderer?.destroy?.(); } catch {}
      try { view.close(); } catch {}
      view.remove();
      viewRef.current = null;
    };
    // Deps: only bookBlob — runtime config read from refs (configRef, settingsRef, callbacksRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookBlob]);

  const theme = THEME_STYLES[settings.theme];

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: theme.bg,
        }}
      />
      <FootnotePopup html={footnoteHtml} side={footnoteSide} settings={settings} />
    </>
  );
});

export default EbookReader;
