import type { RefObject } from "react";
import { sanitizeHtml } from "./sanitize-html";
import { isFootnoteRef, injectFootnoteHitAreaStyle } from "./reader-footnotes";
import { addCustomEventListener } from "./reader-input";
import type { ReaderLinkDetail } from "../types/reader-events";
import type { ReaderViewElement } from "../types/reader-foliate";

export interface FootnoteHandlerCallbacks {
  setFootnoteHtml: (html: string | null) => void;
  setFootnoteSide: (side: "left" | "right") => void;
  setFootnoteOpen: (open: boolean) => void;
  lastClickXRef: RefObject<number>;
}

/**
 * Attaches footnote-related event handlers to a view:
 * - 'link' event → footnote popup
 *
 * Returns cleanup function.
 */
export function attachFootnoteHandler(
  view: ReaderViewElement,
  container: HTMLElement,
  callbacks: FootnoteHandlerCallbacks,
): () => void {
  const removeLinkListener = addCustomEventListener<ReaderLinkDetail>(view, "link", (e) => {
    const { a, href } = e.detail;
    if (!isFootnoteRef(a)) return;
    e.preventDefault();
    void (async () => {
      try {
        const book = view.book;
        if (!book) return;
        const containerWidth = container.getBoundingClientRect().width;
        const side = callbacks.lastClickXRef.current < containerWidth / 2 ? "left" : "right";
        callbacks.setFootnoteSide(side);

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
        callbacks.setFootnoteOpen(true);
        callbacks.setFootnoteHtml(sanitizeHtml(el.innerHTML || el.textContent || ""));
      } catch (err) {
        console.error("Failed to load footnote:", err);
      }
    })();
  });

  return removeLinkListener;
}

/**
 * Called from the 'load' event handler to set up footnote-related
 * document-level listeners on each loaded iframe doc.
 */
export function setupFootnoteDocListeners(
  doc: Document,
  lastClickXRef: RefObject<number>,
  lastClickYRef: RefObject<number>,
): void {
  injectFootnoteHitAreaStyle(doc);
  doc.addEventListener("click", (ev: MouseEvent) => {
    lastClickXRef.current = ev.screenX - globalThis.screenX;
    lastClickYRef.current = ev.screenY - globalThis.screenY;
  }, true);
}
