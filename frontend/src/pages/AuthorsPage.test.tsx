// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import AuthorsPage from "./AuthorsPage";

describe("AuthorsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders author names as links when data is fetched successfully", async () => {
    server.use(
      http.get("/api/authors", () =>
        HttpResponse.json({
          authors: [
            { id: 1, name: "Frank Herbert", sortName: "Herbert, Frank", bookCount: 6, tags: null },
            { id: 2, name: "Isaac Asimov", sortName: "Asimov, Isaac", bookCount: 15, tags: [{ id: 1, name: "sci-fi" }] },
          ],
          tags: [],
          languages: [],
        })
      )
    );

    renderWithProviders(<AuthorsPage />);

    await waitFor(() => {
      expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
    });

    expect(screen.getByText("Isaac Asimov")).toBeInTheDocument();

    const herbertLink = screen.getByText("Frank Herbert").closest("a");
    expect(herbertLink).not.toBeNull();
    expect(herbertLink?.getAttribute("href")).toBe("/authors/1");

    const asimovLink = screen.getByText("Isaac Asimov").closest("a");
    expect(asimovLink).not.toBeNull();
    expect(asimovLink?.getAttribute("href")).toBe("/authors/2");
  });

  it("does not crash and stops loading when server returns 500", async () => {
    server.use(
      http.get("/api/authors", () =>
        HttpResponse.json({ detail: "Internal server error" }, { status: 500 })
      )
    );

    renderWithProviders(<AuthorsPage />);

    await waitFor(
      () => {
        expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.queryByText("Авторы не найдены")).toBeInTheDocument();
  });
});
