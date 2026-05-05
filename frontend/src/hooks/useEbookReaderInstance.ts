import { useEffect } from "react";
import type { MutableRefObject, RefObject } from "react";
import { applySettings } from "../utils/reader-styling";
import { addCustomEventListener } from "../utils/reader-input";
import { attachFootnoteHandler, setupFootnoteDocListeners } from "../utils/reader-footnote-handler";
import { createNavigationController } from "../utils/reader-navigation";
import { attachReaderInteraction } from "../utils/reader-interaction";
import type { ReaderSettings } from "../types/reader-settings";
import type { ReaderViewElement } from "../types/reader-foliate";
import type { ReaderLoadDetail } from "../types/reader-events";
import type { ReaderNavigationRequest, ReaderRelocateDetail } from "../types/reader-handle";
import type { FootnoteState } from "./useFootnoteState";
import type { useReaderFooter } from "./useReaderFooter";

// Side-effect import: registers <foliate-view> custom element.
import "../vendor/foliate-js/view.js";

export interface EbookReaderInstanceConfig {
  maxInlineSize: string;
  gap: string;
  margin: string | undefined;
  maxBlockSize: string | undefined;
  showFooter: boolean;
  isMobile: boolean;
}

interface InstanceCallbacks {
  onRelocate?: (detail: ReaderRelocateDetail) => void;
  onReady?: () => void;
  onSavePosition?: (cfi: string, fraction: number) => void;
}

export interface UseEbookReaderInstanceParams {
  bookBlob: Blob;
  initialPosition: string | null | undefined;
  containerRef: RefObject<HTMLDivElement | null>;
  viewRef: MutableRefObject<ReaderViewElement | null>;
  performNavigationRef: MutableRefObject<(request: ReaderNavigationRequest) => Promise<void>>;
  callbacksRef: MutableRefObject<InstanceCallbacks | undefined>;
  onCenterTapRef: MutableRefObject<(() => void) | undefined>;
  settingsRef: MutableRefObject<ReaderSettings>;
  configRef: MutableRefObject<EbookReaderInstanceConfig>;
  footnote: FootnoteState;
  footer: ReturnType<typeof useReaderFooter>;
}

/**
 * Owns the lifecycle of one `<foliate-view>` instance bound to `bookBlob`.
 *
 * Recreates the view only when the blob changes; everything else (settings,
 * layout config, callbacks, footnote/footer integrations) is read through
 * stable refs so prop changes don't tear down the foliate instance.
 *
 * Verbatim move of the original [bookBlob]-scoped useEffect from
 * ebook-reader.tsx — see eqt.2 spec/plan for the migration contract.
 */
export function useEbookReaderInstance(params: UseEbookReaderInstanceParams): void {
  const {
    bookBlob,
    initialPosition,
    containerRef,
    viewRef,
    performNavigationRef,
    callbacksRef,
    onCenterTapRef,
    settingsRef,
    configRef,
    footnote,
    footer,
  } = params;

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
      isFootnoteOpen: () => footnote.isOpenRef.current,
      onDismissFootnote: footnote.dismiss,
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
        setupFootnoteDocListeners(doc, footnote.lastClickXRef, footnote.clickYRef);
      }
    });

    const removeLinkListener = attachFootnoteHandler(view, container, footnote.handlerCallbacks);

    // Resize handler: recalculate pages on window resize
    const handleResize = () => footer.recalcPages();
    globalThis.addEventListener("resize", handleResize);

    // Save position on suspend/hide — covers scroll mode where there are no tap events.
    // keepalive: true (set in pushProgressToServer) ensures the server PUT survives pagehide.
    const handlePageHide = () => nav.savePosition();
    globalThis.addEventListener("pagehide", handlePageHide);

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
      globalThis.removeEventListener("resize", handleResize);
      globalThis.removeEventListener("pagehide", handlePageHide);
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
}
