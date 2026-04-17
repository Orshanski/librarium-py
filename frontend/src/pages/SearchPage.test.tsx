// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import type { RawBook } from "@/types";
import SearchPage from "./SearchPage";

// Shared fixture factory — central place to add fields if RawBook grows a
// new non-nullable key. Tests that need a book pass only the overrides
// they care about; defaults fill the rest.
function makeRawBook(overrides: Partial<RawBook> = {}): RawBook {
  return {
    id: 1,
    title: "Example Book",
    authors: "Some Author",
    cover_path: null,
    series_name: null,
    series_number: null,
    tags: null,
    rating: null,
    language: null,
    description: null,
    publisher: null,
    pub_date: null,
    updated_at: null,
    ...overrides,
  };
}

describe("SearchPage — integration", () => {
  it("renders API results for a query", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json({
          books: [makeRawBook({ title: "Example Book" })],
          authors: [],
          series: [],
        }),
      ),
    );
    renderWithProviders(<SearchPage />, { initialEntries: ["/search?q=example"] });
    await waitFor(() =>
      expect(screen.getByText("Example Book")).toBeInTheDocument(),
    );
  });

  it("shows inline error on 500 and does NOT render results", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );
    renderWithProviders(<SearchPage />, { initialEntries: ["/search?q=example"] });

    // Inline error visible.
    await waitFor(() =>
      expect(screen.getByText(/ошибка поиска/i)).toBeInTheDocument(),
    );
    // And happy-path content should NOT be on screen (error replaces results, not appends).
    expect(screen.queryByText("Example Book")).not.toBeInTheDocument();
  });

  it("shows placeholder when query is empty", () => {
    renderWithProviders(<SearchPage />, { initialEntries: ["/search"] });
    expect(
      screen.getByText(/введите запрос в поле поиска/i),
    ).toBeInTheDocument();
  });
});
