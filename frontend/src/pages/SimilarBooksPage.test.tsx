// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import SimilarBooksPage from "./SimilarBooksPage";

const mockBook = {
  id: 42,
  title: "Dune",
  authors: "Herbert",
  series_name: null,
  series_id: null,
  series_number: null,
  tags: null,
  rating: null,
  language: "en",
  cover_path: null,
  description: null,
  publisher: null,
  pub_date: null,
  updated_at: null,
  is_read: null,
};

const mockSimilarBook = {
  title: "Foundation",
  authors: "Isaac Asimov",
  coverUrl: "https://example.com/foundation.jpg",
  litresUrl: "https://litres.ru/foundation",
  rating: 4.5,
  ratingCount: 1000,
};

describe("SimilarBooksPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("happy: renders similar books when both requests succeed", async () => {
    server.use(
      http.get("/api/books/42", () =>
        HttpResponse.json({ book: mockBook, files: [], identifiers: [] })
      ),
      http.get("/api/books/42/similar", () =>
        HttpResponse.json({ books: [mockSimilarBook], source: "litres", error: null })
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/similar/:id" element={<SimilarBooksPage />} />
      </Routes>,
      { initialEntries: ["/similar/42"] }
    );

    await waitFor(() => {
      expect(screen.getByText("Foundation")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Dune").length).toBeGreaterThan(0);
  });

  it("404 on base book: shows error UI when getBook throws NotFoundError", async () => {
    server.use(
      http.get("/api/books/42", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      ),
      // Similar endpoint also needs a handler — both fire in parallel
      http.get("/api/books/42/similar", () =>
        HttpResponse.json({ books: [], source: "litres", error: null })
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/similar/:id" element={<SimilarBooksPage />} />
      </Routes>,
      { initialEntries: ["/similar/42"] }
    );

    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить рекомендации/)).toBeInTheDocument();
    });
  });

  it("service_unavailable: shows error UI on 200 with business-state error, book metadata still visible", async () => {
    server.use(
      http.get("/api/books/42", () =>
        HttpResponse.json({ book: mockBook, files: [], identifiers: [] })
      ),
      http.get("/api/books/42/similar", () =>
        HttpResponse.json({ books: [], source: "litres", error: "service_unavailable" })
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/similar/:id" element={<SimilarBooksPage />} />
      </Routes>,
      { initialEntries: ["/similar/42"] }
    );

    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить рекомендации/)).toBeInTheDocument();
    });
    // Book metadata still rendered
    expect(screen.getAllByText("Dune").length).toBeGreaterThan(0);
  });
});
