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
    authors: "Автор А",
    series_name: null,
    series_number: null,
    tags: null,
    rating: null,
    language: "ru",
    cover_path: null,
    description: null,
    publisher: null,
    pub_date: null,
    updated_at: null,
    is_read: null,
  },
  {
    id: 2,
    title: "Книга вторая",
    authors: "Автор Б",
    series_name: null,
    series_number: null,
    tags: null,
    rating: null,
    language: "ru",
    cover_path: null,
    description: null,
    publisher: null,
    pub_date: null,
    updated_at: null,
    is_read: null,
  },
];

function makeBooks(count: number, startId = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    title: `Книга ${startId + i}`,
    authors: "Автор",
    series_name: null,
    series_number: null,
    tags: null,
    rating: null,
    language: "ru",
    cover_path: null,
    description: null,
    publisher: null,
    pub_date: null,
    updated_at: null,
    is_read: null,
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
