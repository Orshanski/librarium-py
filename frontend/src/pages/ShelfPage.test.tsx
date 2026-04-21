// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import ShelfPage from "./ShelfPage";

describe("ShelfPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders shelf title and books on successful fetch", async () => {
    server.use(
      http.get("/api/shelves/:id", () =>
        HttpResponse.json({
          shelf: { id: 42, name: "My Shelf", isSystem: false, systemCode: null },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: ["Frank Herbert"],
              series: null,
              seriesNumber: null,
              tags: [],
              tagIds: [],
              authorIds: [],
              rating: null,
              isRead: false,
              language: "",
              coverPath: "",
              description: null,
              publisher: null,
              pubDate: null,
              formats: [],
              isbn: null,
            },
            {
              id: 102,
              title: "Foundation",
              authors: ["Isaac Asimov"],
              series: null,
              seriesNumber: null,
              tags: [],
              tagIds: [],
              authorIds: [],
              rating: null,
              isRead: false,
              language: "",
              coverPath: "",
              description: null,
              publisher: null,
              pubDate: null,
              formats: [],
              isbn: null,
            },
          ],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/42"] }
    );

    await waitFor(() => {
      expect(screen.getByText("My Shelf")).toBeInTheDocument();
    });

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Foundation")).toBeInTheDocument();
  });

  it("renders nothing crashy on 404", async () => {
    server.use(
      http.get("/api/shelves/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/999"] }
    );

    // Loading indicator disappears, no crash, no book grid
    await waitFor(() => {
      expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
    });

    // No book grid rendered (shelf is null → returns null)
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
