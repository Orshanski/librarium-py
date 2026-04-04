import { useEffect, useRef, useState } from "react";
import { ReaderSettings, THEME_STYLES, DesktopTapZones, TapAction, DEFAULT_DESKTOP_TAP_ZONES } from "./reader-toolbar";
import { sanitizeHtml } from "../utils/sanitize-html";

// Import foliate-js view (registers <foliate-view> custom element)
import "../vendor/foliate-js/view.js";

export interface ReaderCallbacks {
  onRelocate?: (detail: {
    fraction: number;
    cfi: string;
    tocItem?: { label: string };
    location?: { current: number; total: number };
  }) => void;
  onLoad?: () => void;
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

// Check if a link is a footnote reference
function isFootnoteRef(a: Element): boolean {
  const epubType = a.getAttributeNS("http://www.idpf.org/2007/ops", "type") || "";
  const role = a.getAttribute("role") || "";
  if (["noteref", "biblioref", "glossref"].some(t => epubType.includes(t))) return true;
  if (["doc-noteref", "doc-biblioref", "doc-glossref"].some(r => role.includes(r))) return true;
  // Heuristic: superscript link
  if (a.matches("sup") || a.closest("sup") || (a.children.length === 1 && a.children[0]?.matches("sup"))) return true;
  return false;
}

type TapZoneResult = TapAction | "toolbar";

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

    const view = document.createElement("foliate-view") as any;
    view.style.width = "100%";
    view.style.height = "100%";
    container.appendChild(view);
    viewRef.current = view;

    view.addEventListener("relocate", (e: CustomEvent) => {
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
    });

    view.addEventListener("load", (e: CustomEvent) => {
      callbacksRef.current?.onLoad?.();
      const doc = e.detail?.doc;
      if (doc) {
        // Apply user settings to new document
        applySettings(doc, settingsRef.current, view.renderer);
        // Capture phase: record click position BEFORE foliate-js handles the link
        doc.addEventListener("click", (ev: MouseEvent) => {
          lastClickXRef.current = ev.screenX - window.screenX;
          lastClickYRef.current = ev.screenY - window.screenY;
        }, true);
        doc.addEventListener("click", (ev: MouseEvent) => {
          if ((ev.target as Element)?.closest?.("a[href]")) return; // links handled by foliate-js
          if (footnoteOpenRef.current) {
            setFootnoteHtml(null);
            footnoteOpenRef.current = false;
            return; // only close, don't navigate
          }
          const rect = container.getBoundingClientRect();
          const xFrac = (lastClickXRef.current - rect.left) / rect.width;
          const yFrac = (lastClickYRef.current - rect.top) / rect.height;

          if (isMobile) {
            if (xFrac < 0.33) view.prev();
            else if (xFrac > 0.67) view.next();
            else onCenterTapRef.current?.();
          } else {
            const zones = settingsRef.current.desktopTapZones ?? DEFAULT_DESKTOP_TAP_ZONES;
            const action = resolveDesktopZone(xFrac, yFrac, zones);
            if (action === "prev") view.prev();
            else if (action === "next") view.next();
            else onCenterTapRef.current?.();
          }
        });
      }
    });

    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") view.goLeft();
      else if (e.key === "ArrowRight") view.goRight();
      else if (e.key === "ArrowUp" || e.key === "PageUp") view.prev();
      else if (e.key === "ArrowDown" || e.key === "PageDown") view.next();
    };
    document.addEventListener("keydown", handleKeyDown);

    // Footnote popup: intercept link, load content via createDocument
    view.addEventListener("link", async (e: any) => {
      const { a, href } = e.detail;
      if (!isFootnoteRef(a)) return; // not a footnote, let default goTo happen
      e.preventDefault(); // prevent navigation
      try {
        const containerWidth = container.getBoundingClientRect().width;
        const side = lastClickXRef.current < containerWidth / 2 ? "left" : "right";
        setFootnoteSide(side);

        const resolved = await Promise.resolve(view.book.resolveHref(href));
        if (!resolved) return;
        const { index, anchor } = resolved;
        const doc = await view.book.sections[index].createDocument();
        const el = anchor(doc);
        if (!el) return;
        footnoteOpenRef.current = true;
        setFootnoteHtml(sanitizeHtml(el.innerHTML || el.textContent || ""));
      } catch (err) {
        console.error("Failed to load footnote:", err);
      }
    });

    // Resize handler: recalculate pages on window resize
    const handleResize = () => recalcPages();
    window.addEventListener("resize", handleResize);

    const t0 = performance.now();
    let disposed = false;
    view.open(bookBlob)
      .then(async () => {
        if (disposed) return;
        if (location.hostname === 'localhost') console.log(`[reader] open: ${Math.round(performance.now() - t0)}ms, sections: ${view.book.sections.length}`);
        view.renderer.setAttribute("flow", settingsRef.current.flow);
        view.renderer.setAttribute("max-inline-size", maxInlineSize);
        view.renderer.setAttribute("gap", gap);
        if (margin) view.renderer.setAttribute("margin", margin);
        if (maxBlockSize) view.renderer.setAttribute("max-block-size", maxBlockSize);

        // Navigate to position first — show book immediately
        if (initialPosition) {
          view.goTo(initialPosition);
        } else {
          view.renderer.next();
        }

        // Count total characters — use pre-computed charCount if available (FB2),
        // otherwise fall back to incremental createDocument() in batches
        const sections = view.book.sections;
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
      .catch((err: Error) => console.error("Failed to open book:", err));

    return () => {
      disposed = true;
      clearTimeout(charCountTimerRef.current);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      try { view.renderer?.destroy(); } catch {}
      try { view.close(); } catch {}
      view.remove();
      viewRef.current = null;
    };
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
      {footnoteHtml && (
        <div
          style={{
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
          dangerouslySetInnerHTML={{ __html: `<style>h1,h2,h3{font-size:1em;margin:0 0 8px 0;color:${theme.accent};}p{margin:4px 0;}</style>${footnoteHtml}` }}
        />
      )}
    </>
  );
}
