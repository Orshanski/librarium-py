// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import SearchPage from "@/pages/SearchPage";

describe("reference: integration — search page renders API results", () => {
  it("shows search results for a query from the URL", async () => {
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
});
