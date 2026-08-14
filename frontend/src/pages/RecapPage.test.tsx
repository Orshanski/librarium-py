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
function rectWithTop(top: number): DOMRect {
  return {
    top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function placeAt(el: Element, top: number) {
  Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: () => rectWithTop(top) });
}

function placeSections(prefix: "sec" | "part", tops: number[]) {
  tops.forEach((top, index) => {
    const el = document.getElementById(`recap-${prefix}-${index}`);
    if (!el) throw new Error(`нет раздела recap-${prefix}-${index}`);
    placeAt(el, top);
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
    // Подмены живут до конца файла, если их не снять: следующий тест получил бы
    // чужие часы и чужую раскладку.
    vi.restoreAllMocks();
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
    // Тест красен на неполной версии правки: пересчёт по разделам из документа
    // есть, а секунды тишины после выбора нет — тогда первая же прокрутка по
    // дороге к разделу возвращает подсветку на тот, что виден в этот момент.
    // Часы держим в руках: иначе граница тишины зависела бы от того, за сколько
    // прогон дошёл от щелчка до прокрутки.
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    renderPage();
    const toc = await screen.findByRole("navigation", { name: "Разделы" });
    await userEvent.click(within(toc).getByText("Что осталось открытым"));
    // Прокрутка, начавшаяся по дороге к выбранному разделу, показывает пока
    // ещё первый раздел — подсветка не должна отскакивать к нему.
    placeSections("sec", [10, 800, 1600]);
    fireEvent.scroll(mainEl!);
    expect(activeTocLabel(toc)).toBe("Что осталось открытым");

    // Тишина кончилась — подсветка снова слушается прокрутки.
    now.mockReturnValue(2000);
    fireEvent.scroll(mainEl!);
    expect(activeTocLabel(toc)).toBe("Кто есть кто");
  });

  it("начинает новую вкладку с первого пункта, даже если только что выбрали дальний", async () => {
    // Часы держим в руках: тест стоит на том, что переключение попало внутрь
    // секунды тишины, а на живых часах это зависело бы от скорости прогона.
    vi.spyOn(performance, "now").mockReturnValue(0);
    renderPage();
    const toc = await screen.findByRole("navigation", { name: "Разделы" });
    // Выбор раздела включает секунду тишины, и если переключить вкладку внутри
    // неё, пересчёт по прокрутке промолчит: подсветка обязана быть сброшена
    // сама, иначе она укажет на пункт из прошлой вкладки — а его там может и
    // не быть.
    await userEvent.click(within(toc).getByText("Что осталось открытым"));
    await userEvent.click(screen.getByRole("button", { name: /Подробно/ }));
    const parts = await screen.findByRole("navigation", { name: "Части" });
    expect(activeTocLabel(parts)).toBe("Часть 1");
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
      renderPage();
      const toc = await screen.findByRole("navigation", { name: "Разделы" });
      // Раскладки в jsdom нет — задаём её: в ленту шириной 200 видно только
      // первый пункт, второй начинается за правым краем.
      Object.defineProperty(toc, "clientWidth", { configurable: true, value: 200 });
      within(toc).getAllByRole("button").forEach((item, index) => {
        Object.defineProperty(item, "offsetLeft", { configurable: true, value: index * 150 });
        Object.defineProperty(item, "offsetWidth", { configurable: true, value: 140 });
      });
      placeSections("sec", [-500, 10, 800]);
      fireEvent.scroll(mainEl!);
      // Требование — подсвеченный пункт целиком в окне ленты; каким правилом
      // его туда привели, тест не решает.
      const active = within(toc).getByRole("button", { name: "Что произошло" });
      expect(active.offsetLeft).toBeGreaterThanOrEqual(toc.scrollLeft);
      expect(active.offsetLeft + active.offsetWidth).toBeLessThanOrEqual(toc.scrollLeft + toc.clientWidth);
    });

    it("возвращает ленту к началу, когда вкладка сменилась", async () => {
      // Пункты меняются целиком, а лента — тот же узел и держит своё положение:
      // без пересчёта на смену вкладки подсвеченная «Часть 1» осталась бы за
      // левым краем у того, кто перед этим листал ленту рукой.
      renderPage();
      const toc = await screen.findByRole("navigation", { name: "Разделы" });
      Object.defineProperty(toc, "clientWidth", { configurable: true, value: 200 });
      // Текст в самом начале — верх контейнера выше любого раздела, поэтому
      // подсвечен первый пункт и на другой вкладке он тоже первый. Значит
      // сдвинуть ленту может только сама смена вкладки.
      placeAt(mainEl!, -1000);
      fireEvent.scroll(mainEl!);
      toc.scrollLeft = 500;
      await userEvent.click(screen.getByRole("button", { name: /Подробно/ }));
      const parts = await screen.findByRole("navigation", { name: "Части" });
      expect(parts.scrollLeft).toBe(0);
    });
  });

  it("сообщает об ошибке загрузки", async () => {
    server.use(http.get("/api/books/42/recap", () => new HttpResponse(null, { status: 500 })));
    renderPage();
    expect(await screen.findByText(/Не удалось загрузить/)).toBeInTheDocument();
  });
});
