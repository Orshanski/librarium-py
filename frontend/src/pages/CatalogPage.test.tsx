// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { LocationProbe } from "@/test/location-probe";
import { metadataCache } from "@/cache";
import { registerMetadataCacheHandlers } from "@/cache/handlers";
import { domainEvents } from "@/domain/events";
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
  let unregisterCacheHandlers: (() => void) | undefined;

  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
    unregisterCacheHandlers = registerMetadataCacheHandlers(metadataCache, domainEvents);
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
    unregisterCacheHandlers?.();
    unregisterCacheHandlers = undefined;
    domainEvents.clear();
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

  it("does not write the legacy librarium_catalog_cache on unmount", async () => {
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

    expect(sessionStorage.getItem("librarium_catalog_cache")).toBeNull();
  });

  it("metadata cache: restoration on mount avoids listBooks", async () => {
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

    metadataCache.set(
      "books",
      "/",
      {
        books: mockBooks,
        hasMore: false,
        cursor: 2,
      },
      { context: { kind: "book-list", key: "/", source: "catalog", sort: "addedDesc" } },
    );

    renderWithProviders(<CatalogPage />, { initialEntries: ["/"] });

    expect(screen.getByText("Книга первая")).toBeInTheDocument();
    expect(screen.getByText("Книга вторая")).toBeInTheDocument();
    expect(fetchCount).toBe(0);
  });

  it("metadata cache: patches visible catalog rows after rating event without refetch", async () => {
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

    metadataCache.set(
      "books",
      "/",
      {
        books: [{ ...mockBooks[0], rating: 1 }, mockBooks[1]],
        hasMore: false,
        cursor: 2,
      },
      { context: { kind: "book-list", key: "/", source: "catalog", sort: "addedDesc" } },
    );

    renderWithProviders(<CatalogPage />, { initialEntries: ["/"] });

    expect(screen.getByText("★")).toBeInTheDocument();

    act(() => {
      domainEvents.publish("bookRatingChanged", { bookId: 1, rating: 3 });
    });

    await waitFor(() => {
      expect(screen.getByText("★★★")).toBeInTheDocument();
    });
    expect(fetchCount).toBe(0);
  });

  it("refetches the visible catalog when the books namespace is invalidated", async () => {
    let fetchCount = 0;
    server.use(
      http.get("/api/books", () => {
        fetchCount++;
        return HttpResponse.json({
          books: [{ ...mockBooks[0], id: 3, title: "Свежая книга" }],
          hasMore: false,
          total: 1,
        });
      }),
      http.get("/api/filter-options/:key", () =>
        HttpResponse.json({ authors: [], series: [], tags: [], languages: [] })
      ),
      http.get("/api/tags/cloud", () => HttpResponse.json({ tags: [] })),
    );

    metadataCache.set(
      "books",
      "/",
      {
        books: [{ ...mockBooks[0], title: "Старая книга" }],
        hasMore: false,
        cursor: 1,
      },
      { context: { kind: "book-list", key: "/", source: "catalog", sort: "addedDesc" } },
    );

    renderWithProviders(<CatalogPage />, { initialEntries: ["/"] });

    expect(screen.getByText("Старая книга")).toBeInTheDocument();
    expect(fetchCount).toBe(0);

    act(() => {
      metadataCache.invalidateBookLists();
    });

    await waitFor(() => {
      expect(screen.getByText("Свежая книга")).toBeInTheDocument();
    });
    expect(screen.queryByText("Старая книга")).not.toBeInTheDocument();
    expect(fetchCount).toBe(1);
  });

  it("ignores legacy librarium_catalog_cache even if populated", async () => {
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

    await waitFor(() => {
      expect(screen.getByText("Книга первая")).toBeInTheDocument();
    });
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

  describe("«Сбросить все»", () => {
    /** Строки запроса к /api/books по порядку — видно, с какими фильтрами и сортировкой уходил запрос. */
    function trackBookRequests(): string[] {
      const urls: string[] = [];
      server.use(
        http.get("/api/books", ({ request }) => {
          urls.push(new URL(request.url).search);
          return HttpResponse.json({ books: [], hasMore: false, total: 0 });
        }),
      );
      return urls;
    }

    it("снимает фильтры, но сохраняет выбранную сортировку", async () => {
      const user = userEvent.setup();
      const urls = trackBookRequests();

      renderWithProviders(
        <>
          <LocationProbe />
          <CatalogPage />
        </>,
        { initialEntries: ["/?sort=titleAsc&tagIds=26"] },
      );
      await waitFor(() => expect(urls).toHaveLength(1));
      expect(urls[0]).toContain("tagIds=26");

      await user.click(await screen.findByText("Сбросить все"));

      expect(screen.getByTestId("loc").textContent).toBe("/?sort=titleAsc");
      await waitFor(() => expect(urls.length).toBeGreaterThan(1));
      const last = urls[urls.length - 1];
      expect(last).toContain("sort=titleAsc");
      expect(last).not.toContain("tagIds");
    });

    it("без сортировки в адресе оставляет чистый «/» и перезапрашивает без фильтров", async () => {
      // Проверяется наблюдаемое: адрес после сброса чистый и запрос ушёл без фильтров.
      // Одиночный «?» react-router нормализует сам — проверено откатом `qs ?`-ветки в
      // updateParams, тест остаётся зелёным. Поэтому эта ветка — единообразие четырёх
      // одинаковых функций, а не защита от дефекта; на ключ кэша (urlKey = pathname +
      // search) она не влияет.
      const user = userEvent.setup();
      const urls = trackBookRequests();

      renderWithProviders(
        <>
          <LocationProbe />
          <CatalogPage />
        </>,
        { initialEntries: ["/?tagIds=26"] },
      );
      await waitFor(() => expect(urls).toHaveLength(1));
      expect(urls[0]).toContain("tagIds=26");

      await user.click(await screen.findByText("Сбросить все"));

      expect(screen.getByTestId("loc").textContent).toBe("/");
      await waitFor(() => expect(urls.length).toBeGreaterThan(1));
      expect(urls[urls.length - 1]).not.toContain("tagIds");
    });
  });
});
