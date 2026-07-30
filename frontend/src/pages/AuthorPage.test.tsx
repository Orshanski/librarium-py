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
import AuthorPage from "./AuthorPage";
import {
  describeMobileGearAbsent,
  describeAdminPanelVanishesOnResize,
} from "@/test/entity-page-mobile";

describe("AuthorPage", () => {
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

  it("renders author title and books when data is fetched successfully", async () => {
    server.use(
      http.get("/api/authors/:id", () =>
        HttpResponse.json({
          author: {
            id: 42,
            name: "Isaac Asimov",
            sortName: "Asimov, Isaac",
            bookCount: 2,
            tags: [{ id: 1, name: "sci-fi" }, { id: 2, name: "classic" }],
          },
          books: [
            {
              id: 101,
              title: "Foundation",
              authors: [{ id: 42, name: "Isaac Asimov" }],
              series: { id: 1, name: "Foundation" },
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
              title: "I, Robot",
              authors: [{ id: 42, name: "Isaac Asimov" }],
              series: null,
              seriesNumber: null,
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
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>,
      { initialEntries: ["/authors/42"] }
    );

    await waitFor(() => {
      expect(screen.getByText("I, Robot")).toBeInTheDocument();
    });

    const headings = screen.getAllByText("Isaac Asimov");
    expect(headings.length).toBeGreaterThan(0);
  });

  it("renders not found message when author does not exist (404)", async () => {
    server.use(
      http.get("/api/authors/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>,
      { initialEntries: ["/authors/999"] }
    );

    await waitFor(() => {
      const elements = screen.queryAllByText("Автор не найден");
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it("uses cached author detail on remount without refetch", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/authors/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          author: { id: 42, name: "Isaac Asimov", sortName: "Asimov, Isaac", bookCount: 1, tags: [] },
          books: [
            {
              id: 101,
              title: "Foundation",
              authors: [{ id: 42, name: "Isaac Asimov" }],
              series: null,
              seriesNumber: null,
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
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>
    );

    const first = renderWithProviders(route, { initialEntries: ["/authors/42"] });
    await waitFor(() => expect(screen.getByText("Foundation")).toBeInTheDocument());
    first.unmount();

    renderWithProviders(route, { initialEntries: ["/authors/42"] });

    expect(screen.getByText("Foundation")).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  it("обновляет заголовок при authorRenamed без перехода в Загрузка...", async () => {
    server.use(
      http.get("/api/authors/:id", () =>
        HttpResponse.json({
          author: { id: 42, name: "Old", sortName: "Old", bookCount: 0, tags: [] },
          books: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>,
      { initialEntries: ["/authors/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Old").length).toBeGreaterThan(0);
    });

    await act(async () => {
      domainEvents.publish("authorRenamed", { authorId: 42, name: "New" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
  });

  it("переходит на /authors/{targetId} при authorMerged с sourceId равным authorId", async () => {
    server.use(
      http.get("/api/authors/:id", ({ params }) =>
        HttpResponse.json({
          author: { id: Number(params.id), name: `Author ${params.id}`, sortName: `A${params.id}`, bookCount: 0, tags: [] },
          books: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>,
      { initialEntries: ["/authors/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Author 42").length).toBeGreaterThan(0);
    });

    await act(async () => {
      domainEvents.publish("authorMerged", { sourceId: 42, targetId: 99 });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Author 99").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Автор не найден")).not.toBeInTheDocument();
  });

  it("остаётся на странице при authorMerged с targetId равным authorId (refetch)", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/authors/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          author: { id: 42, name: "Author 42", sortName: "A42", bookCount: 0, tags: [] },
          books: [],
        });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>,
      { initialEntries: ["/authors/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Author 42").length).toBeGreaterThan(0);
    });
    expect(requestCount).toBe(1);

    await act(async () => {
      domainEvents.publish("authorMerged", { sourceId: 99, targetId: 42 });
    });

    await waitFor(() => {
      expect(requestCount).toBe(2);
    });
  });

  it("переходит на /authors при authorDeleted нашего автора", async () => {
    server.use(
      http.get("/api/authors/:id", ({ params }) =>
        HttpResponse.json({
          author: { id: Number(params.id), name: `Author ${params.id}`, sortName: `A${params.id}`, bookCount: 0, tags: [] },
          books: [],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/authors/:id" element={<AuthorPage />} />
        <Route path="/authors" element={<div>Список авторов</div>} />
      </Routes>,
      { initialEntries: ["/authors/42"] }
    );

    await waitFor(() => {
      expect(screen.getAllByText("Author 42").length).toBeGreaterThan(0);
    });

    await act(async () => {
      domainEvents.publish("authorDeleted", { authorId: 42 });
    });

    await waitFor(() => {
      expect(screen.getByText("Список авторов")).toBeInTheDocument();
    });
  });



  it("сбой запроса не оставляет пустую страницу без объяснения", async () => {
    // useCachedResource при не-404 ошибке даёт loading === false и пустые данные,
    // а notFound остаётся false. Без явной ветки страница застревала бы с заголовком
    // «...» и пустым телом — читателю нечего понять и некуда нажать.
    server.use(
      http.get("/api/authors/:id", () => HttpResponse.json({ detail: "Internal server error" }, { status: 500 })),
    );

    renderWithProviders(
      <Routes>
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>,
      { initialEntries: ["/authors/1"] },
    );

    // Сообщение и в заголовке, и в теле — читателю видно, что случилось.
    expect(await screen.findAllByText("Автор не найден")).toHaveLength(2);
  });

});

const authorCase = {
  label: "AuthorPage",
  entityNoun: "автором",
  gearLabel: "Управление автором",
  panelComponent: "EntityAdminPanel",
  titleRegex: /Isaac Asimov/,
  panelText: "Переименовать",
  detailPath: "/api/authors/:id",
  listPath: "/api/authors",
  detailResponse: {
    author: { id: 42, name: "Isaac Asimov", sortName: "Asimov, Isaac", bookCount: 0, tags: [] },
    books: [],
  },
  listResponse: { authors: [] },
  routePath: "/authors/:id",
  initialEntry: "/authors/42",
  pageElement: <AuthorPage />,
};

describeMobileGearAbsent(authorCase);
describeAdminPanelVanishesOnResize(authorCase);
