// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";
import { registerMetadataCacheHandlers } from "@/cache/handlers";
import { domainEvents } from "@/domain/events";
import ShelfPage from "./ShelfPage";

describe("ShelfPage", () => {
  let unregisterCacheHandlers: (() => void) | undefined;

  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
    unregisterCacheHandlers = registerMetadataCacheHandlers(metadataCache, domainEvents);
  });

  afterEach(() => {
    unregisterCacheHandlers?.();
    unregisterCacheHandlers = undefined;
    domainEvents.clear();
  });

  it("renders shelf title and books on successful fetch", async () => {
    server.use(
      http.get("/api/shelves/:id", () =>
        HttpResponse.json({
          shelf: { id: 42, name: "My Shelf", isSystem: false, systemCode: null },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: [{ id: 1, name: "Frank Herbert" }],
              series: null,
              seriesNumber: null,
              coverPath: "",
              rating: null,
              isRead: false,
            },
            {
              id: 102,
              title: "Foundation",
              authors: [{ id: 2, name: "Isaac Asimov" }],
              series: null,
              seriesNumber: null,
              coverPath: "",
              rating: null,
              isRead: false,
            },
          ],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/42"] }
    );

    await waitFor(() => {
      expect(screen.getByText("My Shelf")).toBeInTheDocument();
    });

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Foundation")).toBeInTheDocument();
  });

  it("404 говорит «не найдена», а не «не удалось загрузить»", async () => {
    // Полку могли удалить на другом устройстве. Сообщение о временном сбое заставило бы
    // читателя ждать восстановления, которого не будет.
    server.use(
      http.get("/api/shelves/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/999"] }
    );

    expect(await screen.findAllByText("Полка не найдена")).toHaveLength(2);
    expect(screen.queryByText("Не удалось загрузить")).toBeNull();
  });

  it("publishes events after successful shelf book removal and shelf delete", async () => {
    const user = userEvent.setup();
    const membershipEvents: Array<{ shelfId: number; bookId: number; hasBook: boolean }> = [];
    const deleteEvents: Array<{ shelfId: number }> = [];
    domainEvents.subscribe("shelfMembershipChanged", (payload) => membershipEvents.push(payload));
    domainEvents.subscribe("shelfDeleted", (payload) => deleteEvents.push(payload));

    server.use(
      http.get("/api/shelves/:id", () =>
        HttpResponse.json({
          shelf: { id: 42, name: "My Shelf", isSystem: false, systemCode: null },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: [{ id: 1, name: "Frank Herbert" }],
              series: null,
              seriesNumber: null,
              tags: [],
              rating: null,
              isRead: false,
              language: "",
              coverPath: "",
              description: null,
              publisher: null,
              pubDate: null,
              updatedAt: null,
            },
          ],
        })
      ),
      http.delete("/api/shelves/:shelfId/books/:bookId", () => HttpResponse.json({ ok: true })),
      http.delete("/api/shelves/:id", () => HttpResponse.json({ ok: true })),
    );

    renderWithProviders(
      <Routes>
        <Route path="/" element={<div>Catalog</div>} />
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/42"] }
    );

    await waitFor(() => expect(screen.getByText("Dune")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "✕" }));

    await waitFor(() => {
      expect(membershipEvents).toEqual([{ shelfId: 42, bookId: 101, hasBook: false }]);
    });

    await user.click(screen.getByRole("button", { name: "Удалить полку" }));
    await user.click(screen.getByTestId("confirm-dialog-submit"));

    await waitFor(() => {
      expect(deleteEvents).toEqual([{ shelfId: 42 }]);
    });
  });

  it("uses cached shelf detail on remount without refetch", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/shelves/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          shelf: { id: 42, name: "My Shelf", isSystem: false, systemCode: null },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: [{ id: 1, name: "Frank Herbert" }],
              series: null,
              seriesNumber: null,
              coverPath: "",
              rating: null,
              isRead: false,
            },
          ],
        });
      })
    );

    const route = (
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>
    );

    const first = renderWithProviders(route, { initialEntries: ["/shelves/42"] });
    await waitFor(() => expect(screen.getByText("Dune")).toBeInTheDocument());
    first.unmount();

    renderWithProviders(route, { initialEntries: ["/shelves/42"] });

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  it("patches an open reading-now shelf when visible reading progress changes", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/shelves/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          shelf: { id: 42, name: "Читаю сейчас", isSystem: true, systemCode: "reading_now" },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: [{ id: 1, name: "Frank Herbert" }],
              series: null,
              seriesNumber: null,
              coverPath: "",
              rating: null,
              isRead: false,
            },
          ],
          progressByBookId: {
            101: {
              fraction: requestCount === 1 ? 0.2 : 0.8,
              lastFormat: "EPUB",
              lastReadAt: "2026-05-04T07:00:00Z",
            },
          },
        });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/42"] },
    );

    await waitFor(() => {
      expect(document.querySelector('[style*="width: 20%"]')).toBeInTheDocument();
    });

    domainEvents.publish("readingProgressChanged", {
      bookId: 101,
      hadPosition: true,
      hasPosition: true,
      lastReadAtChanged: true,
      fraction: 0.8,
      lastFormat: "EPUB",
      lastReadAt: "2026-05-04T07:05:00Z",
    });

    await waitFor(() => {
      expect(requestCount).toBe(1);
      expect(document.querySelector('[style*="width: 80%"]')).toBeInTheDocument();
    });
  });

  it("removed books do not reappear when navigating between shelves", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/shelves/:id", ({ params }) => {
        const { id } = params as { id: string };
        return HttpResponse.json({
          shelf: { id: Number(id), name: `Shelf ${id}`, isSystem: false, systemCode: null },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: [{ id: 1, name: "Frank Herbert" }],
              series: null,
              seriesNumber: null,
              coverPath: "",
              rating: null,
              isRead: false,
            },
          ],
        });
      }),
      http.delete("/api/shelves/:shelfId/books/:bookId", () => HttpResponse.json({ ok: true })),
    );

    renderWithProviders(
      <>
        <Link to="/shelves/43">Other shelf</Link>
        <Routes>
          <Route path="/shelves/:id" element={<ShelfPage />} />
        </Routes>
      </>,
      { initialEntries: ["/shelves/42"] },
    );

    await waitFor(() => expect(screen.getByText("Shelf 42")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "✕" }));
    await waitFor(() => expect(screen.queryByText("Dune")).not.toBeInTheDocument());

    await user.click(screen.getByRole("link", { name: "Other shelf" }));

    await waitFor(() => expect(screen.getByText("Shelf 43")).toBeInTheDocument());
    expect(screen.getByText("Dune")).toBeInTheDocument();
  });

  it("во время загрузки не показывает переключатель сортировки", async () => {
    // Набор сортировок зависит от вида полки (systemCode) и известен только из ответа:
    // у «Читаю сейчас» вариантов нет вовсе. Показать до ответа значило бы нарисовать
    // чужие восемь вариантов, которые потом исчезнут, а клик увёл бы на сортировку,
    // которой у полки нет.
    server.use(
      http.get("/api/shelves/:id", () => new Promise(() => {})),
    );

    renderWithProviders(
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/42"] },
    );

    expect(await screen.findByText("Загрузка...")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });


  it("сбой запроса не оставляет пустую страницу без объяснения", async () => {
    // useCachedResource при не-404 ошибке даёт loading === false и пустые данные,
    // а notFound остаётся false. Без явной ветки страница застревала бы с заголовком
    // «...» и пустым телом — читателю нечего понять и некуда нажать.
    server.use(
      http.get("/api/shelves/:id", () => HttpResponse.json({ detail: "Internal server error" }, { status: 500 })),
    );

    renderWithProviders(
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/42"] },
    );

    // Сообщение и в заголовке, и в теле: заголовок «...» означал бы «ещё грузится».
    expect(await screen.findAllByText("Не удалось загрузить")).toHaveLength(2);
    // «Не удалось загрузить», а не «не найдено»: сервер упал, а не сущности нет.
    expect(screen.queryByText("Полка не найдена")).toBeNull();
    // И никакой неправды рядом: запрос упал, а не «книг нет».
    expect(screen.queryByText("На полке нет книг")).toBeNull();
  });
});
