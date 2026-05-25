// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route, useLocation } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";
import { domainEvents } from "@/domain/events";
import BookEditPage, { buildBookUpdateAffected } from "./BookEditPage";

const mockBookDetail = {
  id: 42,
  title: "Тестовая книга",
  authors: [{ id: 1, name: "Автор Тестов" }],
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
  tags: [],
  addedAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

function setupAllHandlers() {
  server.use(
    http.get("/api/books/:id", () =>
      HttpResponse.json({
        book: mockBookDetail,
        files: [{ format: "epub", fileSize: 512000 }],
        identifiers: [],
      })
    ),
    http.get("/api/filter-options/authors", () =>
      HttpResponse.json({ authors: [{ id: 1, name: "Автор Тестов" }] })
    ),
    http.get("/api/filter-options/series", () =>
      HttpResponse.json({ series: [] })
    ),
    http.get("/api/filter-options/tags", () =>
      HttpResponse.json({ tags: [] })
    ),
    http.get("/api/filter-options/languages", () =>
      HttpResponse.json({ languages: [{ name: "ru" }, { name: "en" }] })
    ),
    http.get("/api/publishers", () =>
      HttpResponse.json({ publishers: [] })
    ),
  );
}

describe("BookEditPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
    domainEvents.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("happy: all 6 fetches succeed — edit form renders with book title", async () => {
    setupAllHandlers();

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
      </Routes>,
      { initialEntries: ["/book/42/edit"] }
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    });
  });

  it("save success: PUT /api/books/:id fires, publishes bookUpdated, and navigates", async () => {
    setupAllHandlers();
    let putBody: unknown = null;
    const events: unknown[] = [];
    domainEvents.subscribe("bookUpdated", (payload) => events.push(payload));

    server.use(
      http.put("/api/books/:id", async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({
          ok: true,
          book: { ...mockBookDetail, title: "Тестовая книга 2" },
          files: [{ format: "epub", fileSize: 512000 }],
          identifiers: [],
        });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
        <Route path="/book/:id" element={<div>Book Detail</div>} />
      </Routes>,
      { initialEntries: ["/book/42/edit"] }
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const titleInput = screen.getByDisplayValue("Тестовая книга");
    await user.clear(titleInput);
    await user.type(titleInput, "Тестовая книга 2");
    const isbnInput = screen.getByText("ISBN").parentElement?.querySelector("input");
    expect(isbnInput).toBeTruthy();
    await user.type(isbnInput as HTMLInputElement, "9780000000000");
    const saveBtn = screen.getByRole("button", { name: /сохранить/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(putBody).not.toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByText("Book Detail")).toBeInTheDocument();
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      book: { id: 42, title: "Тестовая книга 2" },
      changedFields: ["title", "identifiers"],
      detail: {
        book: { id: 42, title: "Тестовая книга 2" },
      },
    });
    expect(putBody).toMatchObject({ isbn: "9780000000000" });
  });

  it("buildBookUpdateAffected includes old and new membership values only for changed fields", () => {
    expect(buildBookUpdateAffected(["authors", "series", "tags", "language"], mockBookDetail, {
      ...mockBookDetail,
      authors: [{ id: 2, name: "Новый Автор" }],
      series: { id: 20, name: "Новая серия" },
      tags: [{ id: 200, name: "Новый тег" }],
      language: "en",
    })).toEqual({
      authorIds: [1, 2],
      seriesIds: [20],
      tagIds: [200],
      languages: ["ru", "en"],
    });

    expect(buildBookUpdateAffected(["title"], mockBookDetail, { ...mockBookDetail, title: "Другое" })).toBeUndefined();
  });

  it("does not publish membership changes for author/tag reorder-only saves", async () => {
    setupAllHandlers();
    const original = {
      ...mockBookDetail,
      authors: [{ id: 1, name: "Автор Тестов" }, { id: 2, name: "Второй автор" }],
      tags: [{ id: 1, name: "Фэнтези" }, { id: 2, name: "Детектив" }],
    };
    const events: unknown[] = [];
    domainEvents.subscribe("bookUpdated", (payload) => events.push(payload));

    server.use(
      http.get("/api/books/:id", () =>
        HttpResponse.json({
          book: original,
          files: [{ format: "epub", fileSize: 512000 }],
          identifiers: [],
        }),
      ),
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ authors: original.authors }),
      ),
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: original.tags }),
      ),
      http.put("/api/books/:id", async ({ request }) => {
        const body = await request.json() as { authorIds: unknown[]; tagIds: unknown[] };
        expect(body.authorIds).toEqual([2, 1]);
        expect(body.tagIds).toEqual([2, 1]);
        return HttpResponse.json({
          ok: true,
          book: { ...original, authors: [...original.authors].reverse(), tags: [...original.tags].reverse() },
          files: [{ format: "epub", fileSize: 512000 }],
          identifiers: [],
        });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
        <Route path="/book/:id" element={<div>Book Detail</div>} />
      </Routes>,
      { initialEntries: ["/book/42/edit"] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Удалить Автор Тестов" }));
    await user.click(screen.getByRole("button", { name: "Удалить Второй автор" }));
    await user.type(screen.getByPlaceholderText("Найти или добавить автора..."), "Второй");
    await user.click(screen.getByText("Второй автор"));
    await user.type(screen.getByPlaceholderText("Найти или добавить автора..."), "Автор");
    await user.click(screen.getByText("Автор Тестов"));

    await user.click(screen.getByRole("button", { name: "Удалить Фэнтези" }));
    await user.click(screen.getByRole("button", { name: "Удалить Детектив" }));
    await user.type(screen.getByPlaceholderText("Найти или добавить жанр..."), "Детектив");
    await user.click(screen.getByText("Детектив"));
    await user.type(screen.getByPlaceholderText("Найти или добавить жанр..."), "Фэнтези");
    await user.click(screen.getByText("Фэнтези"));

    await user.click(screen.getByRole("button", { name: /сохранить/i }));

    await waitFor(() => {
      expect(screen.getByText("Book Detail")).toBeInTheDocument();
    });

    expect(events).toEqual([]);
  });

  it("save: navigate state.origin взят из editOrigin.bookOrigin (цепочка crumb к источнику)", async () => {
    setupAllHandlers();
    server.use(
      http.put("/api/books/:id", () => HttpResponse.json({ ok: true })),
    );

    let capturedState: unknown = null;
    function LocationSpy() {
      const location = useLocation();
      capturedState = location.state;
      return <div>Book Detail state-spy</div>;
    }

    const editOrigin = {
      type: "book" as const,
      url: "/book/42",
      label: "Тестовая книга",
      bookOrigin: {
        type: "author" as const,
        url: "/authors/7",
        label: "Автор Тестов",
      },
    };

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
        <Route path="/book/:id" element={<LocationSpy />} />
      </Routes>,
      { initialEntries: [{ pathname: "/book/42/edit", state: { origin: editOrigin } }] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /сохранить/i }));

    await waitFor(() => {
      expect(screen.getByText("Book Detail state-spy")).toBeInTheDocument();
    });

    expect(capturedState).toEqual({ origin: editOrigin.bookOrigin });
  });

  it("save без editOrigin в state: navigate state.origin = fallback Каталог", async () => {
    setupAllHandlers();
    server.use(
      http.put("/api/books/:id", () => HttpResponse.json({ ok: true })),
    );

    let capturedState: unknown = null;
    function LocationSpy() {
      const location = useLocation();
      capturedState = location.state;
      return <div>Book Detail state-spy</div>;
    }

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
        <Route path="/book/:id" element={<LocationSpy />} />
      </Routes>,
      { initialEntries: ["/book/42/edit"] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /сохранить/i }));

    await waitFor(() => {
      expect(screen.getByText("Book Detail state-spy")).toBeInTheDocument();
    });

    expect(capturedState).toEqual({
      origin: { type: "catalog", url: "/", label: "Каталог" },
    });
  });

  it("shows not-found when book fetch returns 404", async () => {
    server.use(
      http.get("/api/books/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      ),
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ authors: [] })
      ),
      http.get("/api/filter-options/series", () =>
        HttpResponse.json({ series: [] })
      ),
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: [] })
      ),
      http.get("/api/filter-options/languages", () =>
        HttpResponse.json({ languages: [] })
      ),
      http.get("/api/publishers", () =>
        HttpResponse.json({ publishers: [] })
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
      </Routes>,
      { initialEntries: ["/book/999/edit"] }
    );

    await waitFor(() => {
      const elements = screen.queryAllByText("Книга не найдена");
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it("uses cached book and edit options on remount without refetch", async () => {
    let bookRequestCount = 0;
    let authorsRequestCount = 0;
    let seriesRequestCount = 0;
    let tagsRequestCount = 0;
    let languagesRequestCount = 0;
    let publishersRequestCount = 0;

    server.use(
      http.get("/api/books/:id", () => {
        bookRequestCount += 1;
        return HttpResponse.json({
          book: mockBookDetail,
          files: [{ format: "epub", fileSize: 512000 }],
          identifiers: [],
        });
      }),
      http.get("/api/filter-options/authors", () => {
        authorsRequestCount += 1;
        return HttpResponse.json({ authors: [{ id: 1, name: "Автор Тестов" }] });
      }),
      http.get("/api/filter-options/series", () => {
        seriesRequestCount += 1;
        return HttpResponse.json({ series: [] });
      }),
      http.get("/api/filter-options/tags", () => {
        tagsRequestCount += 1;
        return HttpResponse.json({ tags: [] });
      }),
      http.get("/api/filter-options/languages", () => {
        languagesRequestCount += 1;
        return HttpResponse.json({ languages: [{ name: "ru" }] });
      }),
      http.get("/api/publishers", () => {
        publishersRequestCount += 1;
        return HttpResponse.json({ publishers: [] });
      }),
    );

    const route = (
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
      </Routes>
    );

    const first = renderWithProviders(route, { initialEntries: ["/book/42/edit"] });
    await waitFor(() => expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument());
    first.unmount();

    renderWithProviders(route, { initialEntries: ["/book/42/edit"] });

    expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    expect(bookRequestCount).toBe(1);
    expect(authorsRequestCount).toBe(1);
    expect(seriesRequestCount).toBe(1);
    expect(tagsRequestCount).toBe(1);
    expect(languagesRequestCount).toBe(1);
    expect(publishersRequestCount).toBe(1);
  });
});
