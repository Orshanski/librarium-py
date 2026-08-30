// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";
import { domainEvents } from "@/domain/events";
import { registerMetadataCacheHandlers } from "@/cache/handlers";
import BookPage from "./BookPage";

const mockBookDetail = {
  id: 42,
  title: "Мастер и Маргарита",
  authors: [{ id: 1, name: "Михаил Булгаков" }],
  series: null,
  seriesNumber: null,
  coverPath: "/api/covers/42",
  rating: null,
  isRead: false,
  sortTitle: null,
  description: null,
  language: "ru",
  publisher: null,
  pubDate: null,
  tags: [{ id: 1, name: "роман" }, { id: 2, name: "классика" }],
  addedAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("BookPage", () => {
  // Кэш-обработчики в тестовой среде ставятся вручную (образец — ShelfPage.test):
  // регистрация в beforeEach/afterEach, чтобы падение теста не оставляло
  // подписки на модульной шине для соседних тестов.
  let unregisterCacheHandlers: (() => void) | undefined;

  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
    domainEvents.clear();
    unregisterCacheHandlers = registerMetadataCacheHandlers(metadataCache, domainEvents);
  });

  afterEach(() => {
    unregisterCacheHandlers?.();
    unregisterCacheHandlers = undefined;
  });

  it("happy: renders book title and files on successful fetch", async () => {
    server.use(
      http.get("/api/books/:id", () =>
        HttpResponse.json({
          book: mockBookDetail,
          files: [{ format: "epub", fileSize: 1048576 }],
          identifiers: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id" element={<BookPage />} />
      </Routes>,
      { initialEntries: ["/book/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Мастер и Маргарита").length).toBeGreaterThan(0);
    });
  });

  it("bookUpdated с detail обновляет страницу слиянием, без повторного GET", async () => {
    // Ловит возврат замены/инвалидации: мутация «слить → инвалидировать» даёт
    // повторный GET (requestCount=2) со старым заголовком — тест краснеет дважды.
    let requestCount = 0;
    server.use(
      http.get("/api/books/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          book: { ...mockBookDetail, rating: 4, isRead: true },
          files: [{ format: "epub", fileSize: 1048576 }],
          identifiers: [],
        });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id" element={<BookPage />} />
      </Routes>,
      { initialEntries: ["/book/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Мастер и Маргарита").length).toBeGreaterThan(0);
    });

    // Серверное событие правки: detail на проводе чищен от user-полей.
    const { rating: _rating, isRead: _isRead, ...wireBook } = { ...mockBookDetail, title: "Новое название" };
    domainEvents.publish("bookUpdated", {
      book: { id: 42, title: "Новое название" },
      detail: {
        book: wireBook as never,
        files: [{ id: 1, format: "epub", fileSize: 1048576 }],
        identifiers: [],
      },
      changedFields: ["title"],
    });

    await waitFor(() => {
      expect(screen.getAllByText("Новое название").length).toBeGreaterThan(0);
    });
    expect(requestCount).toBe(1);

    // User-поля кэшированной записи пережили слияние.
    const cached = metadataCache.get<{ book: { rating: number | null; isRead: boolean; title: string } }>("book/42", "detail");
    expect(cached?.book).toMatchObject({ rating: 4, isRead: true, title: "Новое название" });
  });

  it("happy with series: loads series books when book has series.id", async () => {
    const bookWithSeries = { ...mockBookDetail, series: { id: 5, name: "Серия" } };

    server.use(
      http.get("/api/books/:id", ({ params }) => {
        const { id } = params as { id: string };
        if (id === "42") {
          return HttpResponse.json({
            book: bookWithSeries,
            files: [],
            identifiers: [],
          });
        }
        return HttpResponse.json({ detail: "Not found" }, { status: 404 });
      }),
      http.get("/api/books", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("seriesIds") === "5") {
          return HttpResponse.json({
            books: [
              { ...mockBookDetail, id: 43, title: "Другая книга серии", series: { id: 5, name: "Серия" } },
            ],
            hasMore: false,
          });
        }
        return HttpResponse.json({ books: [], hasMore: false });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id" element={<BookPage />} />
      </Routes>,
      { initialEntries: ["/book/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Мастер и Маргарита").length).toBeGreaterThan(0);
    });
  });

  it("loading: shows 'Загрузка...' status screen while fetch is in-flight", async () => {
    let release!: () => void;
    const inFlight = new Promise<void>((r) => { release = r; });

    server.use(
      http.get("/api/books/:id", async () => {
        await inFlight;
        return HttpResponse.json({
          book: mockBookDetail,
          files: [],
          identifiers: [],
        });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id" element={<BookPage />} />
      </Routes>,
      { initialEntries: ["/book/42"] },
    );

    // Before the fetch resolves, the StatusScreen renders "Загрузка..."
    expect(screen.getByText("Загрузка...")).toBeInTheDocument();

    release();

    // After resolve, the loading message is replaced with the book content.
    await waitFor(() => {
      expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
    });
  });

  it("404: shows not-found UI when book does not exist", async () => {
    server.use(
      http.get("/api/books/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id" element={<BookPage />} />
      </Routes>,
      { initialEntries: ["/book/999"] }
    );

    await waitFor(() => {
      const elements = screen.queryAllByText("Книга не найдена");
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it("uses cached book detail on remount without refetch", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/books/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          book: mockBookDetail,
          files: [{ format: "epub", fileSize: 1048576 }],
          identifiers: [],
        });
      })
    );

    const route = (
      <Routes>
        <Route path="/book/:id" element={<BookPage />} />
      </Routes>
    );

    const first = renderWithProviders(route, { initialEntries: ["/book/42"] });
    await waitFor(() => expect(screen.getAllByText("Мастер и Маргарита").length).toBeGreaterThan(0));
    first.unmount();

    renderWithProviders(route, { initialEntries: ["/book/42"] });

    expect(screen.getAllByText("Мастер и Маргарита").length).toBeGreaterThan(0);
    expect(requestCount).toBe(1);
  });

  // Регресс: навигация книга→книга внутри одного маршрута /book/:id (клик по
  // карточке рейла серии) НЕ ремаунтит BookPage. Производный стейт isRead в
  // BookDetail (useState(book.isRead)) застревает на значении предыдущей книги,
  // когда у целевой книги нет загрузочного экрана — т.е. её деталь уже в кэше
  // (книгу уже открывали в этой сессии). Тогда BookDetail не размонтируется и
  // кнопка показывает статус прошлой книги.
  it("series nav back to a cached book: read toggle reflects that book, not the previous one", async () => {
    const user = userEvent.setup();
    const series = { id: 5, name: "Серия" };
    const bookOne = { ...mockBookDetail, id: 42, title: "Книга Один", isRead: true, rating: 4, series, seriesNumber: 1 };
    const bookTwo = { ...mockBookDetail, id: 43, title: "Книга Два", isRead: false, rating: 1, series, seriesNumber: 2 };

    server.use(
      http.get("/api/books/:id", ({ params }) => {
        const { id } = params as { id: string };
        if (id === "42") return HttpResponse.json({ book: bookOne, files: [], identifiers: [] });
        if (id === "43") return HttpResponse.json({ book: bookTwo, files: [], identifiers: [] });
        return HttpResponse.json({ detail: "Not found" }, { status: 404 });
      }),
      http.get("/api/books", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("seriesIds") === "5") {
          return HttpResponse.json({ books: [bookOne, bookTwo], hasMore: false });
        }
        return HttpResponse.json({ books: [], hasMore: false });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id" element={<BookPage />} />
      </Routes>,
      { initialEntries: ["/book/42"] }
    );

    // Книга 42 прочитана → кнопка «✓ Прочитано».
    await waitFor(() => expect(screen.getByText(/✓ Прочитано/i)).toBeInTheDocument());

    // Переход 42 → 43: книга 43 ещё не в кэше → «Загрузка...» → BookDetail
    // ремаунтится, поэтому этот переход корректен даже без фикса. После него
    // деталь обеих книг закэширована.
    const toTwo = screen.getByText("Книга Два").closest("a");
    if (!toTwo) throw new Error("series rail link «Книга Два» not found");
    await user.click(toTwo);
    expect(await screen.findByRole("heading", { name: /Книга Два/, level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Не прочитано/i)).toBeInTheDocument());
    expect(screen.getByTestId("book-rating").dataset.rating).toBe("1");

    // Переход 43 → 42: деталь книги 42 уже в кэше → нет «Загрузки» → BookDetail
    // не ремаунтится. Кнопка и рейтинг обязаны отразить книгу 42 (прочитана,
    // рейтинг 4), а не застрявший стейт книги 43.
    const toOne = screen.getByText("Книга Один").closest("a");
    if (!toOne) throw new Error("series rail link «Книга Один» not found");
    await user.click(toOne);
    expect(await screen.findByRole("heading", { name: /Книга Один/, level: 1 })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/✓ Прочитано/i)).toBeInTheDocument());
    expect(screen.queryByText(/Не прочитано/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("book-rating").dataset.rating).toBe("4");
  });
});
