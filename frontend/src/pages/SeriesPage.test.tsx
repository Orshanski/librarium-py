// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { Routes, Route } from "react-router-dom";
import SeriesPage from "./SeriesPage";
import {
  describeMobileGearAbsent,
  describeAdminPanelVanishesOnResize,
} from "@/test/entity-page-mobile";

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
            sortName: "Foundation",
            bookCount: 7,
            authors: [{ id: 1, name: "Isaac Asimov" }],
          },
          books: [
            {
              id: 101,
              title: "Foundation",
              authors: [{ id: 1, name: "Isaac Asimov" }],
              series: { id: 42, name: "Foundation" },
              seriesNumber: 1,
              tags: [],
              rating: null,
              language: "en",
              coverPath: null,
              description: null,
              publisher: null,
              pubDate: null,
              updatedAt: null,
            },
            {
              id: 102,
              title: "Foundation and Empire",
              authors: [{ id: 1, name: "Isaac Asimov" }],
              series: { id: 42, name: "Foundation" },
              seriesNumber: 2,
              tags: [],
              rating: null,
              language: "en",
              coverPath: null,
              description: null,
              publisher: null,
              pubDate: null,
              updatedAt: null,
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

const seriesCase = {
  label: "SeriesPage",
  entityNoun: "серией",
  gearLabel: "Управление серией",
  panelComponent: "EntityAdminPanel",
  titleRegex: /Foundation/,
  panelText: "Переименовать",
  detailPath: "/api/series/:id",
  listPath: "/api/series",
  detailResponse: {
    series: { id: 42, name: "Foundation", sortName: "Foundation", bookCount: 0, authors: [] },
    books: [],
  },
  listResponse: { series: [] },
  routePath: "/series/:id",
  initialEntry: "/series/42",
  pageElement: <SeriesPage />,
};

describeMobileGearAbsent(seriesCase);
describeAdminPanelVanishesOnResize(seriesCase);
