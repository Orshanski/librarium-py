// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";
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
  retell: { parts: [{ number: 1, paragraphs: ["Часть первая, абзац"] }] },
};

const BOOK = {
  id: 42, title: "Черная Призма", authors: [{ id: 1, name: "Брент Уикс" }],
  series: null, seriesNumber: null, coverPath: "/api/covers/42", rating: null, isRead: false,
  tags: [], recapPath: "/api/books/42/recap?t=1",
};

function renderPage() {
  return renderWithProviders(
    <Routes><Route path="/book/:id/recap" element={<RecapPage />} /></Routes>,
    { initialEntries: ["/book/42/recap"] },
  );
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

  it("сообщает об ошибке загрузки", async () => {
    server.use(http.get("/api/books/42/recap", () => new HttpResponse(null, { status: 500 })));
    renderPage();
    expect(await screen.findByText(/Не удалось загрузить/)).toBeInTheDocument();
  });
});
