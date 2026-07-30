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
import SeriesPage from "./SeriesPage";
import {
  describeMobileGearAbsent,
  describeAdminPanelVanishesOnResize,
} from "@/test/entity-page-mobile";

describe("SeriesPage", () => {
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

  it("uses cached series detail on remount without refetch", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/series/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          series: { id: 42, name: "Foundation", sortName: "Foundation", bookCount: 1, authors: [] },
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
          ],
        });
      })
    );

    const route = (
      <Routes>
        <Route path="/series/:id" element={<SeriesPage />} />
      </Routes>
    );

    const first = renderWithProviders(route, { initialEntries: ["/series/42"] });
    await waitFor(() => expect(screen.getAllByText("Foundation").length).toBeGreaterThan(0));
    first.unmount();

    renderWithProviders(route, { initialEntries: ["/series/42"] });

    expect(screen.getAllByText("Foundation").length).toBeGreaterThan(0);
    expect(requestCount).toBe(1);
  });

  it("обновляет заголовок при seriesRenamed без перехода в Загрузка...", async () => {
    server.use(
      http.get("/api/series/:id", () =>
        HttpResponse.json({
          series: { id: 42, name: "Old", sortName: "Old", bookCount: 0, authors: [] },
          books: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/series/:id" element={<SeriesPage />} />
      </Routes>,
      { initialEntries: ["/series/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Old").length).toBeGreaterThan(0);
    });

    await act(async () => {
      domainEvents.publish("seriesRenamed", { seriesId: 42, name: "New" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
  });

  it("переходит на /series/{targetId} при seriesMerged с sourceId равным seriesId", async () => {
    server.use(
      http.get("/api/series/:id", ({ params }) =>
        HttpResponse.json({
          series: { id: Number(params.id), name: `Series ${params.id}`, sortName: `S${params.id}`, bookCount: 0, authors: [] },
          books: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/series/:id" element={<SeriesPage />} />
      </Routes>,
      { initialEntries: ["/series/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Series 42").length).toBeGreaterThan(0);
    });

    await act(async () => {
      domainEvents.publish("seriesMerged", { sourceId: 42, targetId: 99 });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Series 99").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Серия не найдена")).not.toBeInTheDocument();
  });

  it("остаётся на странице при seriesMerged с targetId равным seriesId (refetch)", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/series/:id", () => {
        requestCount += 1;
        const name = requestCount === 1 ? "Series 42" : "Series 42 Merged";
        return HttpResponse.json({
          series: { id: 42, name, sortName: "S42", bookCount: 0, authors: [] },
          books: [],
        });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/series/:id" element={<SeriesPage />} />
      </Routes>,
      { initialEntries: ["/series/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Series 42").length).toBeGreaterThan(0);
    });
    expect(requestCount).toBe(1);

    await act(async () => {
      domainEvents.publish("seriesMerged", { sourceId: 99, targetId: 42 });
    });

    await waitFor(() => {
      expect(requestCount).toBe(2);
    });
    await waitFor(() => {
      expect(screen.getAllByText("Series 42 Merged").length).toBeGreaterThan(0);
    });
  });

  it("переходит на /series при seriesDeleted нашей серии", async () => {
    server.use(
      http.get("/api/series/:id", ({ params }) =>
        HttpResponse.json({
          series: { id: Number(params.id), name: `Series ${params.id}`, sortName: `S${params.id}`, bookCount: 0, authors: [] },
          books: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/series/:id" element={<SeriesPage />} />
        <Route path="/series" element={<div>Список серий</div>} />
      </Routes>,
      { initialEntries: ["/series/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Series 42").length).toBeGreaterThan(0);
    });

    await act(async () => {
      domainEvents.publish("seriesDeleted", { seriesId: 42 });
    });

    await waitFor(() => {
      expect(screen.getByText("Список серий")).toBeInTheDocument();
    });
  });



  it("сбой запроса не оставляет пустую страницу без объяснения", async () => {
    // useCachedResource при не-404 ошибке даёт loading === false и пустые данные,
    // а notFound остаётся false. Без явной ветки страница застревала бы с заголовком
    // «...» и пустым телом — читателю нечего понять и некуда нажать.
    server.use(
      http.get("/api/series/:id", () => HttpResponse.json({ detail: "Internal server error" }, { status: 500 })),
    );

    renderWithProviders(
      <Routes>
        <Route path="/series/:id" element={<SeriesPage />} />
      </Routes>,
      { initialEntries: ["/series/1"] },
    );

    // «Не удалось загрузить», а не «не найдено»: сервер упал, а не сущности нет.
    expect(screen.queryByText("Серия не найдена")).toBeNull();
    expect(await screen.findByText("Не удалось загрузить")).toBeInTheDocument();
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
