import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { ReaderSettings, THEME_STYLES, DesktopTapZones, TapAction, DEFAULT_DESKTOP_TAP_ZONES } from "./reader-toolbar";
import { sanitizeHtml } from "../utils/sanitize-html";

// Import foliate-js view (registers <foliate-view> custom element)
import "../vendor/foliate-js/view.js";

export interface ReaderCallbacks {
  onRelocate?: (detail: {
    fraction: number;
    cfi: string;
    tocItem?: { label: string; href: string };
    location?: { current: number; total: number };
  }) => void;
  onLoad?: () => void;
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

// Selectors that identify a footnote-style link in rendered book content.
// Covers three markup conventions:
//   1. EPUB3 canonical: <a epub:type="noteref"> / biblioref / glossref,
//      either as a namespaced attribute (XHTML parse) or as a literal
//      attribute name (HTML parse) — we handle both.
//   2. ARIA doc-* roles — same spec as above, alt markup.
//   3. Superscript heuristic for FB2 / plain HTML — <sup><a></a></sup>
//      or <a><sup></sup></a>.
// Used by both isFootnoteRef() (for the foliate 'link' event) and
// injectFootnoteHitAreaStyle() (for touch hit-area expansion). Keep both
// in sync by editing this list in one place.
const FOOTNOTE_REF_SELECTORS = [
  'a[href][epub\\:type~="noteref"]',
  'a[href][epub\\:type~="biblioref"]',
  'a[href][epub\\:type~="glossref"]',
  'a[href][epub|type~="noteref"]',
  'a[href][epub|type~="biblioref"]',
  'a[href][epub|type~="glossref"]',
  'a[href][role~="doc-noteref"]',
  'a[href][role~="doc-biblioref"]',
  'a[href][role~="doc-glossref"]',
  'sup a[href]',
  'a[href]:has(sup)',
];

// Check if a link is a footnote reference. The getAttributeNS lookup
// mirrors the namespaced epub:type selector in FOOTNOTE_REF_SELECTORS;
// the role / sup checks mirror the other selectors. Logic kept in JS
// (rather than a.matches(FOOTNOTE_REF_SELECTORS.join(','))) because
// matches() in an XHTML-parsed doc can't reach namespaced attrs
// without a declared CSS namespace — getAttributeNS can.
function isFootnoteRef(a: Element): boolean {
  const epubType = a.getAttributeNS("http://www.idpf.org/2007/ops", "type") || "";
  const role = a.getAttribute("role") || "";
  if (["noteref", "biblioref", "glossref"].some(t => epubType.includes(t))) return true;
  if (["doc-noteref", "doc-biblioref", "doc-glossref"].some(r => role.includes(r))) return true;
  // Heuristic: superscript link
  if (a.matches("sup") || a.closest("sup") || (a.children.length === 1 && a.children[0]?.matches("sup"))) return true;
  return false;
}

// Inject a stylesheet into a book iframe document that expands the click
// hit area of footnote-style links. Books wrap footnote markers in tiny
// <sup> elements; the native touch hit-test (and by extension our own
// tap-zone guard in paginator.js) is too strict to catch off-by-a-few-
// pixels taps. A zero-size ::after overlay extends the hit box by
// FOOTNOTE_HIT_EXPANSION_PX in every direction without shifting layout
// (no line-height grow, no neighbour push). Native click then picks up
// the fuzzy hit via foliate's #handleLinks → 'link' event → popup.
//
// @namespace declaration is required so the [epub|type~=...] selectors
// match namespaced attributes in XHTML-parsed EPUB3 documents; the
// literal [epub\:type~=...] form covers HTML-parsed docs.
//
// Value must match NEAREST_LINK_RADIUS in paginator.js #onTouchStart so
// both hit-expansion paths (native click via this overlay + our JS
// synthetic-tap guard) agree on what "near a footnote" means.
const FOOTNOTE_HIT_EXPANSION_PX = 20;

function injectFootnoteHitAreaStyle(doc: Document): void {
  const MARKER = "data-librarium-footnote-hitarea";
  if (doc.head?.querySelector(`style[${MARKER}]`)) return; // idempotent
  const selectorList = FOOTNOTE_REF_SELECTORS.join(",\n  ");
  const afterSelectorList = FOOTNOTE_REF_SELECTORS.map(s => `${s}::after`).join(",\n  ");
  const style = doc.createElement("style");
  style.setAttribute(MARKER, "");
  style.textContent = `
    @namespace epub url(http://www.idpf.org/2007/ops);
    ${selectorList} {
      position: relative;
    }
    ${afterSelectorList} {
      content: "";
      position: absolute;
      inset: -${FOOTNOTE_HIT_EXPANSION_PX}px;
    }
  `;
  (doc.head ?? doc.documentElement).appendChild(style);
}

type TapZoneResult = TapAction | "toolbar";

type NormalizedReaderInput =
  | { kind: "tap" | "click"; x: number; y: number; target: Element | null }
  | { kind: "keyboard"; key: string };

type ReaderAction =
  | { type: "prev" }
  | { type: "next" }
  | { type: "goLeft" }
  | { type: "goRight" }
  | { type: "toggleToolbar" }
  | { type: "followLink" }
  | { type: "dismissFootnote" }
  | { type: "noop" };

type ReaderNavigationRequest =
  | { type: "prev" | "next"; persist?: boolean; allowDuringInit?: boolean }
  | { type: "goTo"; target: string | number; persist?: boolean; allowDuringInit?: boolean };

interface ReaderViewElement extends HTMLElement {
  book?: {
    toc?: unknown[];
    resolveHref: (href: string) => Promise<{ index: number; anchor: (doc: Document) => Element | null } | null> | { index: number; anchor: (doc: Document) => Element | null } | null;
    sections: Array<{ charCount?: number; createDocument?: () => Promise<Document> }>;
  };
  close: () => void;
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  goTo: (target: string | number) => Promise<void>;
  goToTextStart?: () => Promise<void>;
  lastLocation?: { cfi?: string; fraction?: number };
  next: () => Promise<void>;
  open: (book: Blob) => Promise<void>;
  performNavigation?: (request: ReaderNavigationRequest) => Promise<void>;
  prev: () => Promise<void>;
  renderer?: {
    destroy?: () => void;
    feet?: HTMLElement[];
    getContents?: () => Array<{ doc: Document }>;
    next: () => Promise<void>;
    setAttribute: (name: string, value: string) => void;
    setStyles?: (styles: string) => void;
  };
}

interface ReaderRelocateDetail {
  fraction: number;
  cfi: string;
  tocItem?: { label: string; href: string };
  location?: { current: number; total: number };
}

interface ReaderLoadDetail {
  doc?: Document;
}

interface ReaderTapDetail {
  screenX: number;
  screenY: number;
  target: Element | null;
}

interface ReaderLinkDetail {
  a: Element;
  href: string;
}

function resolveDesktopZone(xFrac: number, yFrac: number, zones: DesktopTapZones): TapZoneResult {
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

// Estimate chars per page from font settings and container dimensions
function estimateCharsPerPage(container: HTMLElement, settings: ReaderSettings): number {
  const rect = container.getBoundingClientRect();
  const avgCharWidth = settings.fontSize * 0.55;
  const lineHeight = settings.fontSize * settings.lineSpacing;
  const charsPerLine = Math.floor(rect.width * 0.85 / avgCharWidth);
  const linesPerPage = Math.floor(rect.height * 0.9 / lineHeight);
  return Math.max(Math.round(charsPerLine * linesPerPage / 2), 50);
}

export default function EbookReader({ bookBlob, initialPosition, settings, onCenterTap, callbacks, maxInlineSize = "1000px", gap = "5%", margin, maxBlockSize, showFooter = true, isMobile = false }: EbookReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const onCenterTapRef = useRef(onCenterTap);
  onCenterTapRef.current = onCenterTap;
  const settingsRef = useRef(settings);
  const [footnoteHtml, setFootnoteHtml] = useState<string | null>(null);
  const [footnoteSide, setFootnoteSide] = useState<"left" | "right">("left");
  const lastClickXRef = useRef(0);
  const lastClickYRef = useRef(0);
  const footnoteOpenRef = useRef(false);
  const totalCharsRef = useRef(0);
  const totalPagesRef = useRef(0);
  const charCountTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Recalculate total pages from chars and current layout
  const recalcPages = () => {
    const container = containerRef.current;
    if (!container || !totalCharsRef.current) return;
    const cpp = estimateCharsPerPage(container, settingsRef.current);
    totalPagesRef.current = Math.max(1, Math.round(totalCharsRef.current / cpp));
  };

  // Apply settings when they change
  useEffect(() => {
    settingsRef.current = settings;
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
    view.renderer.setAttribute("max-inline-size", maxInlineSize);
    view.renderer.setAttribute("gap", gap);
    if (margin) view.renderer.setAttribute("margin", margin);
    if (maxBlockSize) view.renderer.setAttribute("max-block-size", maxBlockSize);
    recalcPages();
  }, [settings]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !bookBlob) return;

    const view = document.createElement("foliate-view") as ReaderViewElement;
    view.style.width = "100%";
    view.style.height = "100%";
    container.appendChild(view);
    viewRef.current = view;
    let disposed = false;
    const contentLoadedRef = { current: false };
    const interactiveRef = { current: false };
    const navigationQueueRef = { current: Promise.resolve() as Promise<void> };
    const readyNotifiedRef = { current: false };

    const notifyReady = () => {
      if (!contentLoadedRef.current || !interactiveRef.current || readyNotifiedRef.current) return;
      readyNotifiedRef.current = true;
      callbacksRef.current?.onReady?.();
    };

    const saveCurrentPosition = () => {
      const loc = view.lastLocation;
      if (loc?.cfi) {
        callbacksRef.current?.onSavePosition?.(loc.cfi, loc.fraction ?? 0);
      }
    };

    const enqueueNavigation = (
      task: () => Promise<void>,
      options?: { persist?: boolean; allowDuringInit?: boolean },
    ): Promise<void> => {
      const { persist = true, allowDuringInit = false } = options ?? {};
      const run = async () => {
        if (disposed) return;
        if (!allowDuringInit && !interactiveRef.current) return;
        try {
          await task();
          if (persist) saveCurrentPosition();
        } finally {
          notifyReady();
        }
      };
      navigationQueueRef.current = navigationQueueRef.current
        .catch(() => {})
        .then(run);
      return navigationQueueRef.current;
    };

    const performNavigation = (request: ReaderNavigationRequest): Promise<void> => {
      if (request.type === "goTo") {
        return enqueueNavigation(() => view.goTo(request.target), {
          persist: request.persist,
          allowDuringInit: request.allowDuringInit,
        });
      }
      if (request.type === "prev") {
        return enqueueNavigation(() => view.prev(), {
          persist: request.persist,
          allowDuringInit: request.allowDuringInit,
        });
      }
      return enqueueNavigation(() => view.next(), {
        persist: request.persist,
        allowDuringInit: request.allowDuringInit,
      });
    };

    view.performNavigation = performNavigation;

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
      if (isMobile) {
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
      if (!interactiveRef.current && action.type !== "followLink" && action.type !== "noop") return Promise.resolve();
      if (action.type === "prev") return performNavigation({ type: "prev" });
      if (action.type === "next") return performNavigation({ type: "next" });
      if (action.type === "goLeft") return enqueueNavigation(() => view.goLeft());
      if (action.type === "goRight") return enqueueNavigation(() => view.goRight());
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

    view.addEventListener("relocate", ((event: Event) => {
      const e = event as CustomEvent<ReaderRelocateDetail>;
      const { fraction, cfi, tocItem, location } = e.detail;
      callbacksRef.current?.onRelocate?.({ fraction, cfi, tocItem, location });

      // Fill footer with virtual page number and chapter title (desktop only)
      const feet = view.renderer?.feet;
      if (showFooter && feet?.length && totalPagesRef.current > 0) {
        const theme = THEME_STYLES[settingsRef.current.theme];
        const currentPage = Math.min(Math.max(1, Math.round(fraction * totalPagesRef.current)), totalPagesRef.current);
        const pageText = `${currentPage} / ${totalPagesRef.current}`;
        const chapterText = tocItem?.label || "";
        const footStyle = {
          fontSize: "11px",
          color: theme.text,
          fontFamily: "'IBM Plex Sans', sans-serif",
          opacity: "0.4",
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "nowrap",
        };
        if (feet.length === 1) {
          Object.assign(feet[0].style, { ...footStyle, textAlign: "center" });
          feet[0].textContent = chapterText ? `${pageText}  ·  ${chapterText}` : pageText;
        } else {
          Object.assign(feet[0].style, { ...footStyle, textAlign: "left" });
          feet[0].textContent = pageText;
          Object.assign(feet[feet.length - 1].style, { ...footStyle, textAlign: "right" });
          feet[feet.length - 1].textContent = chapterText;
        }
      }
    }) as EventListener);

    view.addEventListener("load", ((event: Event) => {
      const e = event as CustomEvent<ReaderLoadDetail>;
      contentLoadedRef.current = true;
      callbacksRef.current?.onLoad?.();
      notifyReady();
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
    }) as EventListener);

    // Touch tap-zone path: foliate's paginator emits a 'tap' event on a
    // clean single-finger tap (no scroll, no pinch, small delta). This
    // replaces the browser-synthesised click on touch devices, which fires
    // even when iOS cancels a system gesture mid-way.
    view.addEventListener("tap", ((event: Event) => {
      const e = event as CustomEvent<ReaderTapDetail>;
      void dispatchInput({
        kind: "tap",
        x: e.detail.screenX - window.screenX,
        y: e.detail.screenY - window.screenY,
        target: e.detail.target,
      });
    }) as EventListener);

    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      void dispatchInput({ kind: "keyboard", key: e.key });
    };
    document.addEventListener("keydown", handleKeyDown);

    // Footnote popup: intercept link, load content via createDocument
    view.addEventListener("link", (async (event: Event) => {
      const e = event as CustomEvent<ReaderLinkDetail>;
      const { a, href } = e.detail;
      if (!isFootnoteRef(a)) return; // not a footnote, let default goTo happen
      e.preventDefault(); // prevent navigation
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
        if (!doc) return;
        const el = anchor(doc);
        if (!el) return;
        footnoteOpenRef.current = true;
        setFootnoteHtml(sanitizeHtml(el.innerHTML || el.textContent || ""));
      } catch (err) {
        console.error("Failed to load footnote:", err);
      }
    }) as EventListener);

    // Resize handler: recalculate pages on window resize
    const handleResize = () => recalcPages();
    window.addEventListener("resize", handleResize);

    // Save position on suspend/hide — covers scroll mode where there are no tap events.
    // keepalive: true (set in pushProgressToServer) ensures the server PUT survives pagehide.
    const handlePageHide = () => {
      saveCurrentPosition();
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
        renderer.setAttribute("max-inline-size", maxInlineSize);
        renderer.setAttribute("gap", gap);
        if (margin) renderer.setAttribute("margin", margin);
        if (maxBlockSize) renderer.setAttribute("max-block-size", maxBlockSize);

        // Finish initial navigation before making the reader interactive.
        await (initialPosition
          ? performNavigation({ type: "goTo", target: initialPosition, persist: false, allowDuringInit: true })
          : enqueueNavigation(
            () => view.goToTextStart ? view.goToTextStart() : view.goTo(0),
            { persist: false, allowDuringInit: true },
          ));
        if (!disposed) {
          interactiveRef.current = true;
          notifyReady();
        }

        // Count total characters — use pre-computed charCount if available (FB2),
        // otherwise fall back to incremental createDocument() in batches
        const sections = book.sections;
        const hasCharCount = sections.some((s: { charCount?: number }) => s.charCount != null);
        if (hasCharCount) {
          totalCharsRef.current = sections.reduce((sum: number, s: { charCount?: number }) => sum + (s.charCount || 0), 0);
          recalcPages();
        } else if (!disposed) {
          // EPUB: count incrementally after first paint
          charCountTimerRef.current = setTimeout(async () => {
            try {
              let totalChars = 0;
              const batch = 3;
              for (let i = 0; i < sections.length; i += batch) {
                if (disposed) return;
                for (let j = i; j < Math.min(i + batch, sections.length); j++) {
                  const s = sections[j];
                  if (!s.createDocument) continue;
                  const doc = await s.createDocument();
                  totalChars += (doc.body?.textContent?.length || 0);
                }
                totalCharsRef.current = totalChars;
                recalcPages();
                await new Promise(r => setTimeout(r, 0));
              }
            } catch (err) {
              console.warn("Failed to count chars:", err);
            }
          }, 100);
        }
      })
      .catch((err: Error) => console.error("Failed to open book:", err))
      .finally(() => {
        if (!disposed && !interactiveRef.current) {
          interactiveRef.current = true;
          notifyReady();
        }
      });

    return () => {
      disposed = true;
      clearTimeout(charCountTimerRef.current);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pagehide", handlePageHide);
      view.performNavigation = undefined;
      try { view.renderer?.destroy?.(); } catch {}
      try { view.close(); } catch {}
      view.remove();
      viewRef.current = null;
    };
  }, [bookBlob]);

  const theme = THEME_STYLES[settings.theme];
  const footnotePopupStyle = {
    "--footnote-accent": theme.accent,
  } as CSSProperties;

  useEffect(() => {
    const id = "librarium-footnote-styles";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = `.footnote-popup>h1,.footnote-popup>h2,.footnote-popup>h3{font-size:1em;margin:0 0 8px 0;color:var(--footnote-accent)}.footnote-popup>p{margin:4px 0}`;
    return () => { document.getElementById(id)?.remove(); };
  }, []);

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
      {footnoteHtml && (
        <div
          className="footnote-popup"
          style={{
            ...footnotePopupStyle,
            position: "fixed",
            bottom: 16,
            ...(window.innerWidth > 1000
              ? (footnoteSide === "left" ? { left: "5%", right: "55%" } : { left: "55%", right: "5%" })
              : { left: "5%", right: "5%" }),
            maxHeight: "40vh",
            overflowY: "auto",
            backgroundColor: theme.bg,
            color: theme.text,
            border: `1px solid ${theme.accent}`,
            borderRadius: 12,
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            padding: "16px 20px",
            fontSize: Math.round(settings.fontSize * 0.9),
            lineHeight: 1.4,
            fontFamily: settings.fontFamily,
            zIndex: 100,
          }}
          dangerouslySetInnerHTML={{ __html: footnoteHtml }}
        />
      )}
    </>
  );
}
