// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { Routes, Route } from "react-router-dom";
import AuthorPage from "./AuthorPage";

describe("AuthorPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders author title and books when data is fetched successfully", async () => {
    server.use(
      http.get("/api/authors/:id", () =>
        HttpResponse.json({
          author: {
            id: 42,
            name: "Isaac Asimov",
            sort_name: "Asimov, Isaac",
            book_count: 2,
            tags: "sci-fi,classic",
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
              title: "I, Robot",
              authors: "Isaac Asimov",
              series_name: null,
              series_number: null,
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
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>,
      { initialEntries: ["/authors/42"] }
    );

    await waitFor(() => {
      expect(screen.getByText("I, Robot")).toBeInTheDocument();
    });

    const headings = screen.getAllByText("Isaac Asimov");
    expect(headings.length).toBeGreaterThan(0);
  });

  it("renders not found message when author does not exist (404)", async () => {
    server.use(
      http.get("/api/authors/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>,
      { initialEntries: ["/authors/999"] }
    );

    await waitFor(() => {
      const elements = screen.queryAllByText("Автор не найден");
      expect(elements.length).toBeGreaterThan(0);
    });
  });
});
