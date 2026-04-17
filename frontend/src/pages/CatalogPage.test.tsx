// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
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

describe("CatalogPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
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
