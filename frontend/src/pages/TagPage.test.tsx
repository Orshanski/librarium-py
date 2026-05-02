// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { Routes, Route } from "react-router-dom";
import TagPage from "./TagPage";
import {
  describeMobileGearAbsent,
  describeAdminPanelVanishesOnResize,
} from "@/test/entity-page-mobile";

describe("TagPage", () => {
  beforeEach(() => {
    // Clear sessionStorage between tests
    sessionStorage.clear();
  });

  it("displays tag and books when data is successfully fetched", async () => {
    server.use(
      http.get("/api/tags/:id", () =>
        HttpResponse.json({
          tag: {
            id: 1,
            name: "Science Fiction",
            code: null,
          },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: ["Frank Herbert"],
              series: null,
              seriesNumber: null,
              tags: ["Science Fiction"],
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
              title: "Neuromancer",
              authors: ["William Gibson"],
              series: null,
              seriesNumber: null,
              tags: ["Science Fiction"],
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
        <Route path="/tags/:id" element={<TagPage />} />
      </Routes>,
      { initialEntries: ["/tags/1"] }
    );

    // Wait for books to appear
    await waitFor(() => {
      expect(screen.getByText("Dune")).toBeInTheDocument();
    });

    // Books should appear
    expect(screen.getByText("Neuromancer")).toBeInTheDocument();
  });

  it("displays not found message when tag does not exist", async () => {
    server.use(
      http.get("/api/tags/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/tags/:id" element={<TagPage />} />
      </Routes>,
      { initialEntries: ["/tags/999"] }
    );

    // Should show not found message
    await waitFor(() => {
      const elements = screen.queryAllByText("Жанр не найден");
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it("handles invalid tag ID gracefully", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/tags/:id" element={<TagPage />} />
      </Routes>,
      { initialEntries: ["/tags/invalid"] }
    );

    await waitFor(() => {
      const elements = screen.queryAllByText("Жанр не найден");
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it("omits authorIds query param when no filter is applied", async () => {
    let capturedQuery: Record<string, string> = {};

    server.use(
      http.get("/api/tags/:id", ({ request }) => {
        const url = new URL(request.url);
        capturedQuery = Object.fromEntries(url.searchParams);
        return HttpResponse.json({
          tag: {
            id: 1,
            name: "Fiction",
            code: null,
          },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: ["Frank Herbert"],
              series: null,
              seriesNumber: null,
              tags: ["Fiction"],
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
        });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/tags/:id" element={<TagPage />} />
      </Routes>,
      { initialEntries: ["/tags/1"] },
    );

    // Assert on the book title (which appears only AFTER fetch resolves)
    // rather than the tag name (which shows up in breadcrumbs / PageHeader
    // before the fetch completes) — guarantees server round-trip happened
    // before we inspect capturedQuery.
    await waitFor(() => {
      expect(screen.getByText("Dune")).toBeInTheDocument();
    });

    // No filter was set → authorIds / seriesIds / language must NOT be sent.
    expect(capturedQuery.authorIds).toBeUndefined();
    expect(capturedQuery.seriesIds).toBeUndefined();
    expect(capturedQuery.language).toBeUndefined();
  });
});

const tagCase = {
  label: "TagPage",
  entityNoun: "жанром",
  gearLabel: "Управление жанром",
  panelComponent: "TagAdminPanel",
  titleRegex: /Science Fiction/,
  panelText: "Сопоставить с...",
  detailPath: "/api/tags/:id",
  listPath: "/api/tags",
  detailResponse: {
    tag: { id: 1, name: "Science Fiction", code: null },
    books: [],
  },
  listResponse: { tags: [] },
  routePath: "/tags/:id",
  initialEntry: "/tags/1",
  pageElement: <TagPage />,
};

describeMobileGearAbsent(tagCase);
describeAdminPanelVanishesOnResize(tagCase);
