// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { attachFootnoteHandler } from "../reader-footnote-handler";
import type { ReaderViewElement } from "../../types/reader-foliate";

type Resolved = { index: number; anchor: (doc: Document) => Element | null } | null;

/**
 * Минимальный двойник view: слушатель события 'link' плюс book с разрешением ссылки.
 * Один cast на границе двойника, чтобы не тащить в тест весь интерфейс foliate.
 */
function makeView(options: {
  book?: unknown;
  resolveHref?: () => Resolved;
  createDocument?: (() => Promise<Document | undefined>) | undefined;
  anchorEl?: Element | null;
}) {
  const listeners: Array<(e: Event) => void> = [];
  const anchor = () => options.anchorEl ?? null;
  const view = {
    addEventListener: (type: string, handler: (e: Event) => void) => {
      if (type === "link") listeners.push(handler);
    },
    removeEventListener: () => {},
    book: "book" in options ? options.book : {
      resolveHref: options.resolveHref ?? (() => ({ index: 0, anchor })),
      sections: [{
        createDocument: options.createDocument
          ?? (async () => document.implementation.createHTMLDocument()),
      }],
    },
  };
  return { view: view as unknown as ReaderViewElement, listeners };
}

function makeCallbacks() {
  return {
    setFootnoteHtml: vi.fn(),
    setFootnoteSide: vi.fn(),
    setFootnoteOpen: vi.fn(),
    lastClickXRef: { current: 0 },
  };
}

/** Ссылка-сноска: надстрочная — этого достаточно, чтобы обработчик её признал. */
function footnoteLink(): HTMLAnchorElement {
  const sup = document.createElement("sup");
  const a = document.createElement("a");
  a.setAttribute("href", "#note-1");
  sup.append(a);
  document.body.append(sup);
  return a;
}

function fireLink(listeners: Array<(e: Event) => void>, a: Element, href: string) {
  const event = { detail: { a, href }, preventDefault: vi.fn() } as unknown as Event;
  for (const listener of listeners) listener(event);
}

describe("attachFootnoteHandler", () => {
  it("показывает «Ссылка не найдена», когда ссылка никуда не ведёт", async () => {
    const callbacks = makeCallbacks();
    const { view, listeners } = makeView({ resolveHref: () => null });
    attachFootnoteHandler(view, document.createElement("div"), callbacks);

    fireLink(listeners, footnoteLink(), "#missing");

    await vi.waitFor(() => {
      expect(callbacks.setFootnoteHtml).toHaveBeenCalledWith(
        expect.stringContaining("Ссылка не найдена"),
      );
    });
    expect(callbacks.setFootnoteOpen).toHaveBeenCalledWith(true);
  });

  it("показывает «Ссылка не найдена», когда места в тексте нет", async () => {
    const callbacks = makeCallbacks();
    const { view, listeners } = makeView({ anchorEl: null });
    attachFootnoteHandler(view, document.createElement("div"), callbacks);

    fireLink(listeners, footnoteLink(), "#gone");

    await vi.waitFor(() => {
      expect(callbacks.setFootnoteHtml).toHaveBeenCalledWith(
        expect.stringContaining("Ссылка не найдена"),
      );
    });
  });

  it("показывает «Ссылка не найдена», когда сноска разобралась в пустоту", async () => {
    // Пустая строка не рисует всплывашку, а признак «открыта» при этом уже поднят —
    // следующий тап уходил на её закрытие вместо листания, и страница не листалась.
    const callbacks = makeCallbacks();
    const { view, listeners } = makeView({ anchorEl: document.createElement("div") });
    attachFootnoteHandler(view, document.createElement("div"), callbacks);

    fireLink(listeners, footnoteLink(), "#empty");

    await vi.waitFor(() => {
      expect(callbacks.setFootnoteHtml).toHaveBeenCalledWith(
        expect.stringContaining("Ссылка не найдена"),
      );
    });
  });

  it("показывает «Ссылка не найдена», когда книга ещё не подставлена", async () => {
    const callbacks = makeCallbacks();
    const { view, listeners } = makeView({ book: undefined });
    attachFootnoteHandler(view, document.createElement("div"), callbacks);

    fireLink(listeners, footnoteLink(), "#any");

    await vi.waitFor(() => {
      expect(callbacks.setFootnoteHtml).toHaveBeenCalledWith(
        expect.stringContaining("Ссылка не найдена"),
      );
    });
  });

  it("рабочую сноску показывает как раньше", async () => {
    const callbacks = makeCallbacks();
    const el = document.createElement("div");
    el.innerHTML = "<p>текст сноски</p>";
    const { view, listeners } = makeView({ anchorEl: el });
    attachFootnoteHandler(view, document.createElement("div"), callbacks);

    fireLink(listeners, footnoteLink(), "#ok");

    await vi.waitFor(() => {
      expect(callbacks.setFootnoteHtml).toHaveBeenCalledWith(expect.stringContaining("текст сноски"));
    });
    expect(callbacks.setFootnoteHtml).not.toHaveBeenCalledWith(
      expect.stringContaining("Ссылка не найдена"),
    );
  });

  it("не трогает ссылки, которые не являются сносками", async () => {
    const callbacks = makeCallbacks();
    const { view, listeners } = makeView({});
    attachFootnoteHandler(view, document.createElement("div"), callbacks);

    const plain = document.createElement("a");
    plain.setAttribute("href", "chapter-2.xhtml");
    fireLink(listeners, plain, "chapter-2.xhtml");

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callbacks.setFootnoteHtml).not.toHaveBeenCalled();
    expect(callbacks.setFootnoteOpen).not.toHaveBeenCalled();
  });
});
