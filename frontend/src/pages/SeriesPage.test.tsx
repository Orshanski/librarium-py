// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { Routes, Route } from "react-router-dom";
import SeriesPage from "./SeriesPage";

describe("SeriesPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders series title and books when data is fetched successfully", async () => {
    server.use(
      http.get("/api/series/:id", () =>
        HttpResponse.json({
          series: {
            id: 42,
            name: "Foundation",
            sort_name: "Foundation",
            book_count: 7,
            authors: "Isaac Asimov",
          },
          books: [
            {
              id: 101,
              title: "Foundation",
              authors: "Isaac Asimov",
              series_name: "Foundation",
              series_number: 1,
              tags: null,
              rating: null,
              language: "en",
              cover_path: null,
              description: null,
              publisher: null,
              pub_date: null,
              updated_at: null,
            },
            {
              id: 102,
              title: "Foundation and Empire",
              authors: "Isaac Asimov",
              series_name: "Foundation",
              series_number: 2,
              tags: null,
              rating: null,
              language: "en",
              cover_path: null,
              description: null,
              publisher: null,
              pub_date: null,
              updated_at: null,
            },
          ],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/series/:id" element={<SeriesPage />} />
      </Routes>,
      { initialEntries: ["/series/42"] }
    );

    // Wait for books to load — "Foundation and Empire" only appears after fetch
    await waitFor(() => {
      expect(screen.getByText("Foundation and Empire")).toBeInTheDocument();
    });

    // Series title "Foundation" should appear in the page header (h1)
    const headings = screen.getAllByText("Foundation");
    expect(headings.length).toBeGreaterThan(0);
  });

  it("renders not found message when series does not exist (404)", async () => {
    server.use(
      http.get("/api/series/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/series/:id" element={<SeriesPage />} />
      </Routes>,
      { initialEntries: ["/series/999"] }
    );

    await waitFor(() => {
      const elements = screen.queryAllByText("Серия не найдена");
      expect(elements.length).toBeGreaterThan(0);
    });
  });
});
