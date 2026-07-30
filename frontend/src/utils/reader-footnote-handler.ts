import type { RefObject } from "react";
import { sanitizeHtml } from "./sanitize-html";
import { isFootnoteRef, injectFootnoteHitAreaStyle } from "./reader-footnotes";
import { addCustomEventListener } from "./reader-input";
import type { ReaderLinkDetail } from "../types/reader-events";
import type { ReaderViewElement } from "../types/reader-foliate";

/** Что видит читатель, если сноску показать не удалось. */
export const FOOTNOTE_NOT_FOUND_HTML = "<p>Ссылка не найдена</p>";

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
      const containerWidth = container.getBoundingClientRect().width;
      const side = callbacks.lastClickXRef.current < containerWidth / 2 ? "left" : "right";
      callbacks.setFootnoteSide(side);

      // Правило, а не перечень случаев: любой исход, кроме показанного читателю непустого
      // текста сноски, — неуспех и открывает ту же всплывашку с сообщением. Раньше все
      // такие пути были тихими выходами: тапнул по сноске и не увидел никакой реакции.
      //
      // Признак «открыта» поднимается только вместе с содержимым: при пустой строке
      // всплывашка не рисуется, а поднятый признак съедал следующий тап (тот уходил на
      // закрытие вместо листания) — страница переставала листаться.
      const html = await resolveFootnoteHtml(view, href);
      callbacks.setFootnoteHtml(html || FOOTNOTE_NOT_FOUND_HTML);
      callbacks.setFootnoteOpen(true);
    })();
  });

  return removeLinkListener;
}

/** Пустая строка означает «показать нечего» — вызывающий покажет сообщение. */
async function resolveFootnoteHtml(view: ReaderViewElement, href: string): Promise<string> {
  try {
    const book = view.book;
    if (!book) return "";
    const resolved = await Promise.resolve(book.resolveHref(href));
    if (!resolved) return "";
    const { index, anchor } = resolved;
    const doc = await book.sections[index].createDocument?.();
    if (!doc) {
      console.warn("Failed to open footnote: section createDocument() is unavailable.");
      return "";
    }
    const el = anchor(doc);
    if (!el) return "";
    return sanitizeHtml(el.innerHTML || el.textContent || "");
  } catch (err) {
    console.error("Failed to load footnote:", err);
    return "";
  }
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
