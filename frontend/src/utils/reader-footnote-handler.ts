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
      const html = await resolveFootnoteHtml(view, href, a.id);
      callbacks.setFootnoteHtml(html || FOOTNOTE_NOT_FOUND_HTML);
      callbacks.setFootnoteOpen(true);
    })();
  });

  return removeLinkListener;
}

/** Пустая строка означает «показать нечего» — вызывающий покажет сообщение. */
async function resolveFootnoteHtml(
  view: ReaderViewElement,
  href: string,
  sourceId: string,
): Promise<string> {
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
    // Calibre can put the fragment id on a numbered heading and store the actual
    // note in the following block (for example: <h1 id="n1">1</h1><div>…</div>).
    const isNumberedNoteHeading = el.matches("h1, h2, h3, h4, h5, h6")
      && /^\d+$/.test(el.textContent?.trim() ?? "");
    const contentEl = isNumberedNoteHeading
      ? el.nextElementSibling ?? el
      : el;
    const content = contentEl.cloneNode(true) as Element;
    if (sourceId) {
      for (const link of content.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const linkHref = link.getAttribute("href") ?? "";
        const fragment = linkHref.slice(linkHref.lastIndexOf("#") + 1);
        if (!linkHref.includes("#") || fragment !== sourceId) continue;
        const parent = link.parentElement;
        if (parent?.children.length === 1 && parent.textContent?.trim() === link.textContent?.trim()) {
          parent.remove();
        } else {
          link.remove();
        }
      }
    }
    return sanitizeHtml(content.innerHTML || content.textContent || "");
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
