// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { setupMobileViewport, teardownViewport } from "@/test/mobile-viewport";
import { metadataCache } from "@/cache";
import { colors } from "@/theme";
import RecapPage from "./RecapPage";

const DOC = {
  version: 1,
  bookId: 42,
  book: { title: "Черная Призма", authors: ["Брент Уикс"], series: "Светоносец", seriesNumber: 1 },
  recap: { sections: [
    { title: "Кто есть кто", kind: "people", people: [
      { name: "Кип", about: "подросток из Ректона" },
      { name: "Гэвин Гайл", about: "Призма" },
    ] },
    { title: "Что произошло", kind: "episodes",
      episodes: [{ title: "Гибель Ректона", paragraphs: ["Кип собирает люксин"] }] },
    { title: "Что осталось открытым", kind: "list", items: ["**Гэвин умирает.** Потеря цветов"] },
  ] },
  retell: { parts: [
    { number: 1, paragraphs: ["Часть первая, абзац"] },
    { number: 2, paragraphs: ["Часть вторая, абзац"] },
    { number: 3, paragraphs: ["Часть третья, абзац"] },
  ] },
};

const BOOK = {
  id: 42, title: "Черная Призма", authors: [{ id: 1, name: "Брент Уикс" }],
  series: null, seriesNumber: null, coverPath: "/api/covers/42", rating: null, isRead: false,
  tags: [], recapPath: "/api/books/42/recap?t=1",
};

let mainEl: HTMLElement | null = null;

function renderPage() {
  // Пересчёт подсветки слушает прокрутку контейнера страницы и ищет его как
  // ближайший <main> над собой — как в оболочках desktop-shell и mobile-shell.
  // Поэтому в тесте страница живёт внутри такого же <main>.
  mainEl = document.createElement("main");
  document.body.appendChild(mainEl);
  return renderWithProviders(
    <Routes><Route path="/book/:id/recap" element={<RecapPage />} /></Routes>,
    { initialEntries: ["/book/42/recap"], container: mainEl },
  );
}

/** Нормализованный вид акцентного цвета: сравнивать с ним, а не с записью темы. */
const ACCENT = (() => {
  const probe = document.createElement("div");
  probe.style.color = colors.accent;
  return probe.style.color;
})();

/**
 * Верх элемента в окне. Контейнер страницы в jsdom лежит в нуле, поэтому
 * значение читается как расстояние от его верхней кромки: отрицательное —
 * раздел уже ушёл вверх за пределы экрана.
 */
function placeSections(prefix: "sec" | "part", tops: number[]) {
  tops.forEach((top, index) => {
    const el = document.getElementById(`recap-${prefix}-${index}`);
    if (!el) throw new Error(`нет раздела recap-${prefix}-${index}`);
    Object.defineProperty(el, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top,
        toJSON: () => ({}),
      } as DOMRect),
    });
  });
}

function activeTocLabel(toc: HTMLElement): string | null {
  const active = within(toc).getAllByRole("link").find((el) => el.style.color === ACCENT);
  return active?.textContent ?? null;
}

describe("RecapPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
    server.use(
      http.get("/api/books/42", () => HttpResponse.json({ book: BOOK, files: [], identifiers: [] })),
      http.get("/api/books/42/recap", () => HttpResponse.json(DOC)),
    );
  });

  afterEach(() => {
    mainEl?.remove();
    mainEl = null;
  });

  it("показывает всех персонажей плитками", async () => {
    renderPage();
    // Считаем ровно столько плиток, сколько персонажей в документе: критерий
    // появился из-за того, что прежний разбор молча терял одного из них.
    expect(await screen.findByText("Кип")).toBeInTheDocument();
    expect(screen.getByText(/подросток из Ректона/)).toBeInTheDocument();
    expect(screen.getByText("Гэвин Гайл")).toBeInTheDocument();
    expect(screen.getAllByTestId("recap-person")).toHaveLength(2);
  });

  it("сообщает, что рекапа нет, если книга без него", async () => {
    server.use(
      http.get("/api/books/42", () =>
        HttpResponse.json({ book: { ...BOOK, recapPath: null }, files: [], identifiers: [] })),
    );
    renderPage();
    expect(await screen.findByText(/Рекап не найден/)).toBeInTheDocument();
  });

  it("показывает эпизоды с заголовками", async () => {
    renderPage();
    expect(await screen.findByText("Гибель Ректона")).toBeInTheDocument();
  });

  it("переключает вкладку на пересказ", async () => {
    renderPage();
    await screen.findByText("Кип");
    await userEvent.click(screen.getByRole("button", { name: /Подробно/ }));
    expect(await screen.findByText("Часть первая, абзац")).toBeInTheDocument();
  });

  it("строит оглавление из заголовков разделов", async () => {
    renderPage();
    // Заголовок раздела и пункт оглавления — разные узлы с одним текстом,
    // поэтому ищем адресно внутри оглавления, а не по всей странице.
    const toc = await screen.findByRole("navigation", { name: "Разделы" });
    expect(within(toc).getByText("Кто есть кто")).toBeInTheDocument();
    expect(within(toc).getByText("Что осталось открытым")).toBeInTheDocument();
  });

  it("показывает раздел незнакомого вида сплошным текстом", async () => {
    server.use(http.get("/api/books/42/recap", () => HttpResponse.json({
      ...DOC,
      recap: { sections: [{ title: "Новый раздел", kind: "timeline",
                            events: [{ when: "потом", what: "Кто-то что-то сделал" }] }] },
    })));
    renderPage();
    expect(await screen.findByText(/Кто-то что-то сделал/)).toBeInTheDocument();
  });

  it("ведёт подсветку за прокруткой текста", async () => {
    renderPage();
    const toc = await screen.findByRole("navigation", { name: "Разделы" });
    // Верх второго раздела ушёл выше кромки полосы вкладок, третий ещё под ней.
    placeSections("sec", [-500, 10, 800]);
    fireEvent.scroll(mainEl!);
    expect(activeTocLabel(toc)).toBe("Что произошло");
  });

  it("ведёт подсветку за прокруткой и после переключения вкладки", async () => {
    renderPage();
    await screen.findByText("Кип");
    await userEvent.click(screen.getByRole("button", { name: /Подробно/ }));
    const toc = await screen.findByRole("navigation", { name: "Части" });
    await screen.findByText("Часть третья, абзац");
    placeSections("part", [-900, -400, 10]);
    fireEvent.scroll(mainEl!);
    expect(activeTocLabel(toc)).toBe("Часть 3");
  });

  it("оставляет подсветку на выбранном разделе, пока идёт переход к нему", async () => {
    renderPage();
    const toc = await screen.findByRole("navigation", { name: "Разделы" });
    await userEvent.click(within(toc).getByText("Что осталось открытым"));
    // Прокрутка, начавшаяся по дороге к выбранному разделу, показывает пока
    // ещё первый раздел — подсветка не должна отскакивать к нему.
    placeSections("sec", [10, 800, 1600]);
    fireEvent.scroll(mainEl!);
    expect(activeTocLabel(toc)).toBe("Что осталось открытым");
  });

  describe("на телефоне", () => {
    beforeEach(() => {
      setupMobileViewport();
    });

    afterEach(() => {
      teardownViewport();
    });

    it("подтягивает подсвеченный пункт ленты на глаза", async () => {
      // Пункты идут в один ряд, и подсвеченный уезжает за край экрана вслед за
      // прокруткой текста: без подтягивания подсветка есть, а видно её не всегда.
      const shown: Element[] = [];
      vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(
        function (this: HTMLElement) { shown.push(this); },
      );
      renderPage();
      const toc = await screen.findByRole("navigation", { name: "Разделы" });
      shown.length = 0;
      placeSections("sec", [-500, 10, 800]);
      fireEvent.scroll(mainEl!);
      expect(shown).toContain(within(toc).getByRole("button", { name: "Что произошло" }));
    });
  });

  it("сообщает об ошибке загрузки", async () => {
    server.use(http.get("/api/books/42/recap", () => new HttpResponse(null, { status: 500 })));
    renderPage();
    expect(await screen.findByText(/Не удалось загрузить/)).toBeInTheDocument();
  });
});
