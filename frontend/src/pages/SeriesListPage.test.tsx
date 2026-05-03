// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";
import SeriesListPage from "./SeriesListPage";

describe("SeriesListPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
  });

  it("renders series names as links when data is fetched successfully", async () => {
    server.use(
      http.get("/api/series", () =>
        HttpResponse.json({
          series: [
            { id: 1, name: "Dune", authors: [{ id: 1, name: "Frank Herbert" }], bookCount: 6 },
            { id: 2, name: "Foundation", authors: [{ id: 2, name: "Isaac Asimov" }], bookCount: 7 },
          ],
          authors: [],
          tags: [],
          languages: [],
        })
      )
    );

    renderWithProviders(<SeriesListPage />);

    await waitFor(() => {
      expect(screen.getByText("Dune")).toBeInTheDocument();
    });

    expect(screen.getByText("Foundation")).toBeInTheDocument();

    // Series names should be links pointing to /series/:id
    const duneLink = screen.getByText("Dune").closest("a");
    expect(duneLink).not.toBeNull();
    expect(duneLink?.getAttribute("href")).toBe("/series/1");

    const foundationLink = screen.getByText("Foundation").closest("a");
    expect(foundationLink).not.toBeNull();
    expect(foundationLink?.getAttribute("href")).toBe("/series/2");
  });

  it("does not crash and stops loading when server returns 500", async () => {
    server.use(
      http.get("/api/series", () =>
        HttpResponse.json({ detail: "Internal server error" }, { status: 500 })
      )
    );

    renderWithProviders(<SeriesListPage />);

    // Loading indicator should appear initially then resolve
    await waitFor(
      () => {
        expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Page should render without crashing — "Ничего не найдено" is acceptable
    expect(screen.queryByText("Ничего не найдено")).toBeInTheDocument();
  });

  it("uses cached series data on remount without refetch", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/series", () => {
        requestCount += 1;
        return HttpResponse.json({
          series: [
            { id: 1, name: "Dune", authors: [{ id: 1, name: "Frank Herbert" }], bookCount: 6 },
          ],
          authors: [],
          tags: [],
          languages: [],
        });
      })
    );

    const first = renderWithProviders(<SeriesListPage />);
    await waitFor(() => expect(screen.getByText("Dune")).toBeInTheDocument());
    first.unmount();

    renderWithProviders(<SeriesListPage />);

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });
});
