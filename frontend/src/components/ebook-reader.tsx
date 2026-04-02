import { useEffect, useRef } from "react";
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

export default function EbookReader({ bookBlob, initialPosition, settings, onCenterTap, callbacks }: EbookReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const onCenterTapRef = useRef(onCenterTap);
  onCenterTapRef.current = onCenterTap;
  const settingsRef = useRef(settings);

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
      // Add click handler to iframe document for navigation zones
      const doc = e.detail?.doc;
      if (doc) {
        doc.addEventListener("click", (ev: MouseEvent) => {
          // Skip if clicking a link
          if ((ev.target as Element)?.closest?.("a[href]")) return;
          const rect = doc.documentElement.getBoundingClientRect();
          const x = (ev.clientX - rect.left) / rect.width;
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
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: theme.bg,
      }}
    />
  );
}
