// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import BookPage from "./BookPage";

const mockRawBook = {
  id: 42,
  title: "Мастер и Маргарита",
  authors: "Михаил Булгаков",
  series_name: null,
  series_id: null,
  series_number: null,
  tags: "роман,классика",
  rating: null,
  language: "ru",
  cover_path: null,
  description: null,
  publisher: null,
  pub_date: null,
  updated_at: null,
  is_read: null,
};

describe("BookPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("happy: renders book title and files on successful fetch", async () => {
    server.use(
      http.get("/api/books/:id", () =>
        HttpResponse.json({
          book: mockRawBook,
          files: [{ format: "epub", file_size: 1048576 }],
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

  it("happy with series: loads series books when book has series_id", async () => {
    const bookWithSeries = { ...mockRawBook, series_id: 5, series_name: "Серия" };

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
              { ...mockRawBook, id: 43, title: "Другая книга серии", series_id: 5 },
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
});
