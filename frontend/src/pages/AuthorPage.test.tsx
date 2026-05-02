// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { Routes, Route } from "react-router-dom";
import AuthorPage from "./AuthorPage";
import { setupDesktopViewport, setupMobileViewport, triggerMatchMediaChangeToMobile, teardownViewport } from "@/test/mobile-viewport";

describe("AuthorPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
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
});

describe("AuthorPage — mobile", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setupMobileViewport();
  });
  afterEach(() => teardownViewport());

  it("шестерёнки управления автором нет в DOM, заголовок страницы есть", async () => {
    // Explicit auth-signal через MSW: устанавливаем флаг, проверим waitFor'ом
    // — гарантирует, что AuthProvider успел поставить user=admin до negative-assert.
    let authResolved = false;
    server.use(
      http.get("/api/auth/me", () => {
        authResolved = true;
        return HttpResponse.json({
          id: 1, username: "admin", displayName: "Test Admin",
          email: "admin@test.local", role: "admin",
        });
      }),
      http.get("/api/authors/:id", () =>
        HttpResponse.json({
          author: { id: 42, name: "Isaac Asimov", sortName: "Asimov, Isaac", bookCount: 0, tags: [] },
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

    // Ждём конец loading и резолва auth.
    await waitFor(() => {
      expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
      expect(authResolved).toBe(true);
    });

    // Позитивный sanity: страница отрисовалась через MobilePageHeader (h1).
    expect(screen.getByRole("heading", { level: 1, name: /Isaac Asimov/ })).toBeInTheDocument();
    // Negative-assert ПОСЛЕ гарантированного auth-резолва.
    expect(screen.queryByLabelText("Управление автором")).not.toBeInTheDocument();
  });
});

describe("AuthorPage — resize desktop→mobile с открытой админ-панелью", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setupDesktopViewport();  // stub matchMedia ДО render — ResponsiveProvider зарегистрирует listener на нашем stub'е
  });
  afterEach(() => teardownViewport());

  it("после переключения в mobile EntityAdminPanel уходит из DOM", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/authors/:id", () =>
        HttpResponse.json({
          author: { id: 42, name: "Isaac Asimov", sortName: "Asimov, Isaac", bookCount: 0, tags: [] },
          books: [],
        })
      ),
      http.get("/api/authors", () => HttpResponse.json({ authors: [] }))
    );

    renderWithProviders(
      <Routes>
        <Route path="/authors/:id" element={<AuthorPage />} />
      </Routes>,
      { initialEntries: ["/authors/42"] }
    );

    await waitFor(() => {
      expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
    });

    // 2) На desktop кликаем шестерёнку → открывается EntityAdminPanel.
    const gear = await screen.findByLabelText("Управление автором");
    await user.click(gear);

    await waitFor(() => {
      expect(screen.getByText("Переименовать")).toBeInTheDocument();
    });

    // 3) Эмитим переключение viewport'а в mobile через тот же stub.
    triggerMatchMediaChangeToMobile();

    // 4) Гард `!isMobile && showAdmin && <EntityAdminPanel/>` срабатывает —
    //    панель уходит из DOM.
    await waitFor(() => {
      expect(screen.queryByText("Переименовать")).not.toBeInTheDocument();
    });
  });
});
