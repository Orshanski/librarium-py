// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { Routes, Route } from "react-router-dom";
import SeriesPage from "./SeriesPage";
import { setupDesktopViewport, setupMobileViewport, triggerMatchMediaChangeToMobile, teardownViewport } from "@/test/mobile-viewport";

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

describe("SeriesPage — mobile", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setupMobileViewport();
  });
  afterEach(() => teardownViewport());

  it("шестерёнки управления серией нет в DOM, заголовок страницы есть", async () => {
    let authResolved = false;
    server.use(
      http.get("/api/auth/me", () => {
        authResolved = true;
        return HttpResponse.json({
          id: 1, username: "admin", displayName: "Test Admin",
          email: "admin@test.local", role: "admin",
        });
      }),
      http.get("/api/series/:id", () =>
        HttpResponse.json({
          series: { id: 42, name: "Foundation", sortName: "Foundation", bookCount: 0, authors: [] },
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
      expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
      expect(authResolved).toBe(true);
    });

    expect(screen.getByRole("heading", { level: 1, name: /Foundation/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Управление серией")).not.toBeInTheDocument();
  });
});

describe("SeriesPage — resize desktop→mobile с открытой админ-панелью", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setupDesktopViewport();
  });
  afterEach(() => teardownViewport());

  it("после переключения в mobile EntityAdminPanel уходит из DOM", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/series/:id", () =>
        HttpResponse.json({
          series: { id: 42, name: "Foundation", sortName: "Foundation", bookCount: 0, authors: [] },
          books: [],
        })
      ),
      http.get("/api/series", () => HttpResponse.json({ series: [] }))
    );

    renderWithProviders(
      <Routes>
        <Route path="/series/:id" element={<SeriesPage />} />
      </Routes>,
      { initialEntries: ["/series/42"] }
    );

    await waitFor(() => {
      expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
    });

    const gear = await screen.findByLabelText("Управление серией");
    await user.click(gear);

    await waitFor(() => {
      expect(screen.getByText("Переименовать")).toBeInTheDocument();
    });

    triggerMatchMediaChangeToMobile();

    await waitFor(() => {
      expect(screen.queryByText("Переименовать")).not.toBeInTheDocument();
    });
  });
});
