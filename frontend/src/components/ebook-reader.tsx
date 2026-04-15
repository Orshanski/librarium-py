import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import FootnotePopup from "./FootnotePopup";
import { ReaderSettings, THEME_STYLES, DEFAULT_DESKTOP_TAP_ZONES } from "./reader-toolbar";
import { sanitizeHtml } from "../utils/sanitize-html";
import { isFootnoteRef, injectFootnoteHitAreaStyle } from "../utils/reader-footnotes";
import { resolveDesktopZone, addCustomEventListener } from "../utils/reader-input";
import { createNavigationController } from "../utils/reader-navigation";
import { useReaderFooter } from "../hooks/useReaderFooter";
import type { NormalizedReaderInput, ReaderAction, ReaderLoadDetail, ReaderTapDetail, ReaderLinkDetail } from "../utils/reader-input";
import type { EbookReaderHandle, ReaderNavigationRequest, ReaderRelocateDetail, ReaderViewElement } from "../types/reader";

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

function applySettings(doc: Document, settings: ReaderSettings, renderer?: { setStyles?: (s: string) => void }) {
  const theme = THEME_STYLES[settings.theme];
  const s = doc.documentElement.style;
  s.setProperty("--user-bg", theme.bg);
  s.setProperty("--user-color", theme.text);
  s.setProperty("--user-accent", theme.accent);
  s.setProperty("--user-font", settings.fontFamily);
  s.setProperty("--user-font-size", `${settings.fontSize}px`);
  s.setProperty("--user-line-height", String(settings.lineSpacing));
  s.setProperty("--user-text-align", settings.justify ? "justify" : "start");
  s.setProperty("--user-hyphens", settings.hyphenate ? "auto" : "manual");
  // Trigger paginator background update
  renderer?.setStyles?.("");
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

    const resolveReaderAction = (input: NormalizedReaderInput): ReaderAction => {
      if (input.kind === "keyboard") {
        if (input.key === "ArrowLeft") return { type: "goLeft" };
        if (input.key === "ArrowRight") return { type: "goRight" };
        if (input.key === "ArrowUp" || input.key === "PageUp") return { type: "prev" };
        if (input.key === "ArrowDown" || input.key === "PageDown") return { type: "next" };
        return { type: "noop" };
      }

      const isLinkTarget = Boolean(input.target?.closest("a[href]"));
      if (footnoteOpenRef.current && !isLinkTarget) return { type: "dismissFootnote" };
      if (isLinkTarget) return { type: "followLink" };

      const rect = container.getBoundingClientRect();
      const xFrac = (input.x - rect.left) / rect.width;
      const yFrac = (input.y - rect.top) / rect.height;
      if (configRef.current.isMobile) {
        if (xFrac < 0.33) return { type: "prev" };
        if (xFrac > 0.67) return { type: "next" };
        return { type: "toggleToolbar" };
      }

      const zones = settingsRef.current.desktopTapZones ?? DEFAULT_DESKTOP_TAP_ZONES;
      const action = resolveDesktopZone(xFrac, yFrac, zones);
      if (action === "prev") return { type: "prev" };
      if (action === "next") return { type: "next" };
      return { type: "toggleToolbar" };
    };

    const performReaderAction = (action: ReaderAction): Promise<void> => {
      if (!nav.isInteractive() && action.type !== "followLink" && action.type !== "noop") return Promise.resolve();
      if (action.type === "prev") return nav.performNavigation({ type: "prev" });
      if (action.type === "next") return nav.performNavigation({ type: "next" });
      if (action.type === "goLeft") return nav.enqueueNavigation(() => view.goLeft());
      if (action.type === "goRight") return nav.enqueueNavigation(() => view.goRight());
      if (action.type === "toggleToolbar") {
        onCenterTapRef.current?.();
        return Promise.resolve();
      }
      if (action.type === "dismissFootnote") {
        setFootnoteHtml(null);
        footnoteOpenRef.current = false;
        return Promise.resolve();
      }
      return Promise.resolve();
    };

    const dispatchInput = (input: NormalizedReaderInput): Promise<void> =>
      performReaderAction(resolveReaderAction(input));

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
        // Expand hit area of footnote-style links so native click catches
        // near-miss taps and foliate's #handleLinks fires 'link' on them.
        injectFootnoteHitAreaStyle(doc);
        // Capture phase: record click position BEFORE foliate-js handles the link
        doc.addEventListener("click", (ev: MouseEvent) => {
          lastClickXRef.current = ev.screenX - window.screenX;
          lastClickYRef.current = ev.screenY - window.screenY;
        }, true);
      }
    });

    // Touch tap-zone path: foliate's paginator emits a 'tap' event on a
    // clean single-finger tap (no scroll, no pinch, small delta).
    const removeTapListener = addCustomEventListener<ReaderTapDetail>(view, "tap", (e) => {
      void dispatchInput({
        kind: "tap",
        x: e.detail.screenX - window.screenX,
        y: e.detail.screenY - window.screenY,
        target: e.detail.target,
      });
    });

    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      void dispatchInput({ kind: "keyboard", key: e.key });
    };
    document.addEventListener("keydown", handleKeyDown);

    // Footnote popup: intercept link, load content via createDocument
    const removeLinkListener = addCustomEventListener<ReaderLinkDetail>(view, "link", (e) => {
      const { a, href } = e.detail;
      if (!isFootnoteRef(a)) return; // not a footnote, let default goTo happen
      e.preventDefault(); // prevent navigation
      void (async () => {
        try {
          const book = view.book;
          if (!book) return;
          const containerWidth = container.getBoundingClientRect().width;
          const side = lastClickXRef.current < containerWidth / 2 ? "left" : "right";
          setFootnoteSide(side);

          const resolved = await Promise.resolve(book.resolveHref(href));
          if (!resolved) return;
          const { index, anchor } = resolved;
          const doc = await book.sections[index].createDocument?.();
          if (!doc) {
            console.warn("Failed to open footnote: section createDocument() is unavailable.");
            return;
          }
          const el = anchor(doc);
          if (!el) return;
          footnoteOpenRef.current = true;
          setFootnoteHtml(sanitizeHtml(el.innerHTML || el.textContent || ""));
        } catch (err) {
          console.error("Failed to load footnote:", err);
        }
      })();
    });

    // Resize handler: recalculate pages on window resize
    const handleResize = () => footer.recalcPages();
    window.addEventListener("resize", handleResize);

    // Save position on suspend/hide — covers scroll mode where there are no tap events.
    // keepalive: true (set in pushProgressToServer) ensures the server PUT survives pagehide.
    const handlePageHide = () => {
      const loc = view.lastLocation;
      if (loc?.cfi) callbacksRef.current?.onSavePosition?.(loc.cfi, loc.fraction ?? 0);
    };
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
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pagehide", handlePageHide);
      removeRelocateListener();
      removeLoadListener();
      removeTapListener();
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
