// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, act } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";
import { registerMetadataCacheHandlers } from "@/cache/handlers";
import { domainEvents } from "@/domain/events";
import { Routes, Route } from "react-router-dom";
import TagPage from "./TagPage";
import {
  describeMobileGearAbsent,
  describeAdminPanelVanishesOnResize,
} from "@/test/entity-page-mobile";

describe("TagPage", () => {
  let unregisterCacheHandlers: (() => void) | undefined;

  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
    unregisterCacheHandlers = registerMetadataCacheHandlers(metadataCache, domainEvents);
  });

  afterEach(() => {
    unregisterCacheHandlers?.();
    unregisterCacheHandlers = undefined;
    domainEvents.clear();
  });

  it("displays tag and books when data is successfully fetched", async () => {
    server.use(
      http.get("/api/tags/:id", () =>
        HttpResponse.json({
          tag: {
            id: 1,
            name: "Science Fiction",
            code: null,
            bookCount: 2,
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

    await waitFor(() => {
      expect(screen.getByText("Dune")).toBeInTheDocument();
    });

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
            bookCount: 1,
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

    await waitFor(() => {
      expect(screen.getByText("Dune")).toBeInTheDocument();
    });

    expect(capturedQuery.authorIds).toBeUndefined();
    expect(capturedQuery.seriesIds).toBeUndefined();
    expect(capturedQuery.language).toBeUndefined();
  });

  it("uses cached tag detail on remount without refetch", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/tags/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          tag: { id: 1, name: "Science Fiction", code: null, bookCount: 1 },
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
          ],
        });
      })
    );

    const route = (
      <Routes>
        <Route path="/tags/:id" element={<TagPage />} />
      </Routes>
    );

    const first = renderWithProviders(route, { initialEntries: ["/tags/1"] });
    await waitFor(() => expect(screen.getByText("Dune")).toBeInTheDocument());
    first.unmount();

    renderWithProviders(route, { initialEntries: ["/tags/1"] });

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  it("tagRenamed updates title without 'Загрузка...'", async () => {
    server.use(
      http.get("/api/tags/:id", () =>
        HttpResponse.json({
          tag: { id: 1, name: "Фэнтези", code: null, bookCount: 3 },
          books: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/tags/:id" element={<TagPage />} />
      </Routes>,
      { initialEntries: ["/tags/1"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Фэнтези").length).toBeGreaterThan(0);
    });

    await act(async () => {
      domainEvents.publish("tagRenamed", { tagId: 1, name: "Sci-Fi" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Sci-Fi").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
  });

  it("переходит на /tags/{targetId} при tagMerged с sourceId равным tagId", async () => {
    server.use(
      http.get("/api/tags/:id", ({ params }) =>
        HttpResponse.json({
          tag: { id: Number(params.id), name: `Жанр ${params.id}`, code: null, bookCount: 0 },
          books: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/tags/:id" element={<TagPage />} />
      </Routes>,
      { initialEntries: ["/tags/1"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Жанр 1").length).toBeGreaterThan(0);
    });

    await act(async () => {
      domainEvents.publish("tagMerged", { sourceId: 1, targetId: 2 });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Жанр 2").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Жанр не найден")).not.toBeInTheDocument();
  });

  it("остаётся на странице при tagMerged с targetId равным tagId (refetch)", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/tags/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          tag: { id: 2, name: "Sci-Fi", code: null, bookCount: 7 },
          books: [],
        });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/tags/:id" element={<TagPage />} />
      </Routes>,
      { initialEntries: ["/tags/2"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Sci-Fi").length).toBeGreaterThan(0);
    });
    expect(requestCount).toBe(1);

    await act(async () => {
      domainEvents.publish("tagMerged", { sourceId: 1, targetId: 2 });
    });

    await waitFor(() => {
      expect(requestCount).toBe(2);
    });
  });

  it("переходит на /tags при tagDeleted нашего жанра", async () => {
    server.use(
      http.get("/api/tags/:id", ({ params }) =>
        HttpResponse.json({
          tag: { id: Number(params.id), name: `Жанр ${params.id}`, code: null, bookCount: 0 },
          books: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/tags/:id" element={<TagPage />} />
        <Route path="/tags" element={<div>Список жанров</div>} />
      </Routes>,
      { initialEntries: ["/tags/1"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Жанр 1").length).toBeGreaterThan(0);
    });

    await act(async () => {
      domainEvents.publish("tagDeleted", { tagId: 1 });
    });

    await waitFor(() => {
      expect(screen.getByText("Список жанров")).toBeInTheDocument();
    });
  });
});

const tagCase = {
  label: "TagPage",
  entityNoun: "жанром",
  gearLabel: "Управление жанром",
  panelComponent: "EntityAdminPanel",
  titleRegex: /Science Fiction/,
  panelText: "Переименовать",
  detailPath: "/api/tags/:id",
  listPath: "/api/tags",
  detailResponse: {
    tag: { id: 1, name: "Science Fiction", code: null, bookCount: 0 },
    books: [],
  },
  listResponse: { tags: [] },
  routePath: "/tags/:id",
  initialEntry: "/tags/1",
  pageElement: <TagPage />,
};

describeMobileGearAbsent(tagCase);
describeAdminPanelVanishesOnResize(tagCase);
