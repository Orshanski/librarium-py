// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import SearchPage from "./SearchPage";

describe("SearchPage — integration", () => {
  it("renders API results for a query", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json({
          books: [{ id: 1, title: "Example Book", authors: "Some Author" }],
          authors: [],
          series: [],
        })
      )
    );
    renderWithProviders(<SearchPage />, { initialEntries: ["/search?q=example"] });
    await waitFor(() =>
      expect(screen.getByText("Example Book")).toBeInTheDocument()
    );
  });

  it("shows inline error on 500", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );
    renderWithProviders(<SearchPage />, { initialEntries: ["/search?q=example"] });
    await waitFor(() =>
      expect(screen.getByText(/ошибка поиска/i)).toBeInTheDocument()
    );
  });

  it("shows placeholder when query is empty", () => {
    renderWithProviders(<SearchPage />, { initialEntries: ["/search"] });
    expect(screen.getByText(/введите запрос в поле поиска/i)).toBeInTheDocument();
  });
});
