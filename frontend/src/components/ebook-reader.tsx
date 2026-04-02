import { useEffect, useRef, useState, useCallback } from "react";
import { colors } from "../theme";
import { ReaderSettings, THEME_STYLES } from "./reader-toolbar";

// Import foliate-js view (registers <foliate-view> custom element)
import "../vendor/foliate-js/view.js";

export interface ReaderCallbacks {
  onRelocate?: (detail: { fraction: number; cfi: string; tocItem?: any }) => void;
  onLoad?: () => void;
}

interface EbookReaderProps {
  bookBlob: Blob;
  initialPosition?: string | null;
  settings: ReaderSettings;
  onCenterTap?: () => void;
  callbacks?: ReaderCallbacks;
}

function buildCSS(settings: ReaderSettings): string {
  const theme = THEME_STYLES[settings.theme];
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
      background: ${theme.bg} !important;
      color: ${theme.text} !important;
    }
    body {
      background: ${theme.bg} !important;
      color: ${theme.text} !important;
      font-family: ${settings.fontFamily} !important;
      font-size: ${settings.fontSize}px !important;
    }
    p, li, blockquote, dd {
      line-height: ${settings.lineSpacing};
      text-align: ${settings.justify ? "justify" : "start"};
      -webkit-hyphens: ${settings.hyphenate ? "auto" : "manual"};
      hyphens: ${settings.hyphenate ? "auto" : "manual"};
      -webkit-hyphenate-limit-before: 3;
      -webkit-hyphenate-limit-after: 2;
      -webkit-hyphenate-limit-lines: 2;
      hanging-punctuation: allow-end last;
      widows: 2;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif !important;
    }
    h2 {
      text-align: center;
      font-size: 1.2em;
      font-weight: normal;
      font-style: italic;
    }
    blockquote {
      margin: 1em 5%;
    }
    blockquote p {
      text-indent: 0;
    }
    section > blockquote:first-of-type {
      font-style: italic;
    }
    section > blockquote:first-of-type em,
    section > blockquote:first-of-type i {
      font-style: normal;
    }
    .poem {
      margin: 1em 0 1em 5%;
      text-align: left;
    }
    a:link { color: ${theme.accent}; }
    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
  `;
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

export default function EbookReader({ bookBlob, initialPosition, settings, onCenterTap, callbacks }: EbookReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const onCenterTapRef = useRef(onCenterTap);
  onCenterTapRef.current = onCenterTap;
  const settingsRef = useRef(settings);
  const [footnoteHtml, setFootnoteHtml] = useState<string | null>(null);

  // Apply styles when settings change
  useEffect(() => {
    settingsRef.current = settings;
    const view = viewRef.current;
    if (!view?.renderer) return;
    view.renderer.setStyles?.(buildCSS(settings));
    view.renderer.setAttribute("flow", settings.flow);
    view.renderer.setAttribute("max-inline-size", "1000px");
    view.renderer.setAttribute("gap", "5%");
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
      const { fraction, cfi, tocItem } = e.detail;
      callbacksRef.current?.onRelocate?.({ fraction, cfi, tocItem });
    });

    view.addEventListener("load", (e: CustomEvent) => {
      callbacksRef.current?.onLoad?.();
      const doc = e.detail?.doc;
      if (doc) {
        doc.addEventListener("click", (ev: MouseEvent) => {
          if ((ev.target as Element)?.closest?.("a[href]")) return;
          const rect = container.getBoundingClientRect();
          const x = (ev.screenX - window.screenX) / rect.width;
          if (x < 0.33) view.prev();
          else if (x > 0.67) view.next();
          else onCenterTapRef.current?.();
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
        const resolved = await Promise.resolve(view.book.resolveHref(href));
        if (!resolved) return;
        const { index, anchor } = resolved;
        const doc = await view.book.sections[index].createDocument();
        const el = anchor(doc);
        if (!el) return;
        setFootnoteHtml(el.innerHTML || el.textContent || "");
      } catch (err) {
        console.error("Failed to load footnote:", err);
      }
    });

    view.open(bookBlob)
      .then(() => {
        view.renderer.setStyles?.(buildCSS(settingsRef.current));
        view.renderer.setAttribute("flow", settingsRef.current.flow);
        view.renderer.setAttribute("max-inline-size", "1000px");
        view.renderer.setAttribute("gap", "5%");
        if (initialPosition) {
          view.goTo(initialPosition);
        } else {
          view.renderer.next();
        }
      })
      .catch((err: Error) => console.error("Failed to open book:", err));

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
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
          onClick={() => setFootnoteHtml(null)}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "40vh",
            overflowY: "auto",
            backgroundColor: theme.bg,
            color: theme.text,
            borderTop: `2px solid ${theme.accent}`,
            borderRadius: "12px 12px 0 0",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
            padding: "20px 24px",
            fontSize: 15,
            lineHeight: 1.7,
            fontFamily: settings.fontFamily,
            zIndex: 100,
          }}
          dangerouslySetInnerHTML={{ __html: footnoteHtml }}
        />
      )}
    </>
  );
}
