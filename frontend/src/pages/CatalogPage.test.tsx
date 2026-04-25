// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, act } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import CatalogPage from "./CatalogPage";

const mockBooks = [
  {
    id: 1,
    title: "Книга первая",
    authors: [{ id: 1, name: "Автор А" }],
    series: null,
    seriesNumber: null,
    tags: [],
    rating: null,
    language: "ru",
    coverPath: null,
    description: null,
    publisher: null,
    pubDate: null,
    updatedAt: null,
    isRead: null,
  },
  {
    id: 2,
    title: "Книга вторая",
    authors: [{ id: 2, name: "Автор Б" }],
    series: null,
    seriesNumber: null,
    tags: [],
    rating: null,
    language: "ru",
    coverPath: null,
    description: null,
    publisher: null,
    pubDate: null,
    updatedAt: null,
    isRead: null,
  },
];

function makeBooks(count: number, startId = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    title: `Книга ${startId + i}`,
    authors: [{ id: startId + i, name: "Автор" }],
    series: null,
    seriesNumber: null,
    tags: [],
    rating: null,
    language: "ru",
    coverPath: null,
    description: null,
    publisher: null,
    pubDate: null,
    updatedAt: null,
    isRead: null,
  }));
}

describe("CatalogPage", () => {
  let mainEl: HTMLElement | null = null;

  beforeEach(() => {
    sessionStorage.clear();
    // CatalogPage reads document.querySelector("main") for scroll-based lazy load.
    // Inject a <main> element so the scroll/check logic has a target.
    mainEl = document.createElement("main");
    document.body.appendChild(mainEl);
  });

  afterEach(() => {
    if (mainEl && mainEl.parentNode) {
      mainEl.parentNode.removeChild(mainEl);
    }
    mainEl = null;
  });

  it("happy: GET /api/books returns books — grid renders titles", async () => {
    server.use(
      http.get("/api/books", () =>
        HttpResponse.json({ books: mockBooks, hasMore: false, total: 2 })
      ),
      // filter-options loaded by SmartFilterBar
      http.get("/api/filter-options/:key", () =>
        HttpResponse.json({ authors: [], series: [], tags: [], languages: [] })
      ),
      http.get("/api/tags/cloud", () =>
        HttpResponse.json({ tags: [] })
      ),
    );

    renderWithProviders(<CatalogPage />);

    await waitFor(() => {
      expect(screen.getByText("Книга первая")).toBeInTheDocument();
    });

    expect(screen.getByText("Книга вторая")).toBeInTheDocument();
  });

  it("pagination: scroll triggers loadMore → second GET /api/books?cursor=30 → 50 books total (26f)", async () => {
    const capturedCursors: number[] = [];
    const page1Books = makeBooks(30, 1);
    const page2Books = makeBooks(20, 31);

    server.use(
      http.get("/api/books", ({ request }) => {
        const url = new URL(request.url);
        const cursor = parseInt(url.searchParams.get("cursor") || "0", 10);
        capturedCursors.push(cursor);
        if (cursor === 0) {
          return HttpResponse.json({ books: page1Books, hasMore: true, nextCursor: 30 });
        }
        return HttpResponse.json({ books: page2Books, hasMore: false });
      }),
      http.get("/api/filter-options/:key", () =>
        HttpResponse.json({ authors: [], series: [], tags: [], languages: [] })
      ),
      http.get("/api/tags/cloud", () =>
        HttpResponse.json({ tags: [] })
      ),
    );

    renderWithProviders(<CatalogPage />);

    // Wait for the initial 30 books to render
    await waitFor(() => {
      expect(screen.getByText("Книга 1")).toBeInTheDocument();
    });

    // In jsdom scrollHeight === clientHeight === 0, so the check() timer (300ms)
    // fires loadMore automatically. Advance timers and let the second fetch happen.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    // Assert second request was made with cursor=30
    await waitFor(() => {
      expect(capturedCursors).toContain(30);
    });

    // Assert all 50 books are in the DOM
    await waitFor(() => {
      expect(screen.getByText("Книга 50")).toBeInTheDocument();
    });

    // Spot-check both pages
    expect(screen.getByText("Книга 1")).toBeInTheDocument();
    expect(screen.getByText("Книга 31")).toBeInTheDocument();
  });

  it("кэш: при unmount запись в librarium_catalog_cache для текущего URL (books/hasMore/cursor/version)", async () => {
    server.use(
      http.get("/api/books", () =>
        HttpResponse.json({ books: mockBooks, hasMore: false, total: 2 })
      ),
      http.get("/api/filter-options/:key", () =>
        HttpResponse.json({ authors: [], series: [], tags: [], languages: [] })
      ),
      http.get("/api/tags/cloud", () => HttpResponse.json({ tags: [] })),
    );

    const { unmount } = renderWithProviders(<CatalogPage />, { initialEntries: ["/"] });

    await waitFor(() => {
      expect(screen.getByText("Книга первая")).toBeInTheDocument();
    });

    unmount();

    const raw = sessionStorage.getItem("librarium_catalog_cache");
    expect(raw).not.toBeNull();
    const cache = JSON.parse(raw!);
    expect(cache["/"]).toBeDefined();
    expect(cache["/"].books).toHaveLength(2);
    expect(cache["/"].hasMore).toBe(false);
    expect(cache["/"].cursor).toBe(2);
    expect(cache["/"].version).toBe(0);
  });

  it("кэш: восстановление при mount с валидным version — listBooks не вызывается", async () => {
    let fetchCount = 0;
    server.use(
      http.get("/api/books", () => {
        fetchCount++;
        return HttpResponse.json({ books: mockBooks, hasMore: false, total: 2 });
      }),
      http.get("/api/filter-options/:key", () =>
        HttpResponse.json({ authors: [], series: [], tags: [], languages: [] })
      ),
      http.get("/api/tags/cloud", () => HttpResponse.json({ tags: [] })),
    );

    // Cache hit с валидной версией
    sessionStorage.setItem(
      "librarium_catalog_cache",
      JSON.stringify({
        "/": {
          books: mockBooks,
          hasMore: false,
          cursor: 2,
          version: 0,
        },
      }),
    );

    renderWithProviders(<CatalogPage />, { initialEntries: ["/"] });

    // Немедленно рендерятся из кэша
    expect(screen.getByText("Книга первая")).toBeInTheDocument();
    expect(screen.getByText("Книга вторая")).toBeInTheDocument();
    expect(fetchCount).toBe(0);
  });

  it("кэш: stale version → запись игнорируется, идёт listBooks(0)", async () => {
    let fetchCount = 0;
    server.use(
      http.get("/api/books", () => {
        fetchCount++;
        return HttpResponse.json({ books: mockBooks, hasMore: false, total: 2 });
      }),
      http.get("/api/filter-options/:key", () =>
        HttpResponse.json({ authors: [], series: [], tags: [], languages: [] })
      ),
      http.get("/api/tags/cloud", () => HttpResponse.json({ tags: [] })),
    );

    // Version=5 в счётчике, version=1 в записи → stale
    sessionStorage.setItem("librarium_scroll_counter", "5");
    sessionStorage.setItem(
      "librarium_catalog_cache",
      JSON.stringify({
        "/": {
          books: [{ ...mockBooks[0], title: "Устаревшая книга" }],
          hasMore: false,
          cursor: 1,
          version: 1,
        },
      }),
    );

    renderWithProviders(<CatalogPage />, { initialEntries: ["/"] });

    // stale запись не используется — идёт фетч
    await waitFor(() => {
      expect(screen.getByText("Книга первая")).toBeInTheDocument();
    });
    expect(screen.queryByText("Устаревшая книга")).not.toBeInTheDocument();
    expect(fetchCount).toBe(1);
  });

  it("empty: shows 'Ничего не найдено' when books list is empty", async () => {
    server.use(
      http.get("/api/books", () =>
        HttpResponse.json({ books: [], hasMore: false, total: 0 })
      ),
      http.get("/api/filter-options/:key", () =>
        HttpResponse.json({ authors: [], series: [], tags: [], languages: [] })
      ),
      http.get("/api/tags/cloud", () =>
        HttpResponse.json({ tags: [] })
      ),
    );

    renderWithProviders(<CatalogPage />);

    await waitFor(() => {
      expect(screen.getByText("Ничего не найдено")).toBeInTheDocument();
    });
  });
});
