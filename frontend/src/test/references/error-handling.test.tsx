// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import SearchPage from "@/pages/SearchPage";

describe("reference: error-handling — search page handles 500 without crashing", () => {
  it("keeps chrome rendered and shows no results when the API returns 500", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    renderWithProviders(<SearchPage />, { initialEntries: ["/search?q=example"] });

    // Stable invariant: SearchPage renders a PageHeader with title "Поиск".
    // Present regardless of fetch outcome — proves the page did not crash.
    expect(await screen.findByText("Поиск")).toBeInTheDocument();

    // Happy-path mock result must NOT appear.
    await waitFor(() =>
      expect(screen.queryByText("Example Book")).not.toBeInTheDocument()
    );
  });
});
