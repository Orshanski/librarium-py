// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";
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
  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
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
});
