// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { LocationProbe } from "@/test/location-probe";
import { setupMobileViewport, teardownViewport } from "@/test/mobile-viewport";
import { metadataCache } from "@/cache";
import AuthorsPage from "./AuthorsPage";

describe("AuthorsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
  });

  it("renders author names as links when data is fetched successfully", async () => {
    server.use(
      http.get("/api/authors", () =>
        HttpResponse.json({
          authors: [
            { id: 1, name: "Frank Herbert", sortName: "Herbert, Frank", bookCount: 6, tags: [] },
            { id: 2, name: "Isaac Asimov", sortName: "Asimov, Isaac", bookCount: 15, tags: [{ id: 1, name: "sci-fi" }] },
          ],
          tags: [],
          languages: [],
        })
      )
    );

    renderWithProviders(<AuthorsPage />);

    await waitFor(() => {
      expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
    });

    expect(screen.getByText("Isaac Asimov")).toBeInTheDocument();

    const herbertLink = screen.getByText("Frank Herbert").closest("a");
    expect(herbertLink).not.toBeNull();
    expect(herbertLink?.getAttribute("href")).toBe("/authors/1");

    const asimovLink = screen.getByText("Isaac Asimov").closest("a");
    expect(asimovLink).not.toBeNull();
    expect(asimovLink?.getAttribute("href")).toBe("/authors/2");
  });

  it("does not crash and stops loading when server returns 500", async () => {
    server.use(
      http.get("/api/authors", () =>
        HttpResponse.json({ detail: "Internal server error" }, { status: 500 })
      )
    );

    renderWithProviders(<AuthorsPage />);

    await waitFor(
      () => {
        expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.queryByText("Авторы не найдены")).toBeInTheDocument();
  });

  it("uses cached authors data on remount without refetch", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/authors", () => {
        requestCount += 1;
        return HttpResponse.json({
          authors: [
            { id: 1, name: "Frank Herbert", sortName: "Herbert, Frank", bookCount: 6, tags: [] },
          ],
          tags: [],
          languages: [],
        });
      }),
    );

    const first = renderWithProviders(<AuthorsPage />);
    await waitFor(() => expect(screen.getByText("Frank Herbert")).toBeInTheDocument());
    first.unmount();

    renderWithProviders(<AuthorsPage />);

    expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  describe("«Сбросить все»", () => {
    /** Адреса запросов к /api/authors по порядку — чтобы видеть, с какими фильтрами уходил запрос. */
    function trackAuthorRequests(): string[] {
      const urls: string[] = [];
      server.use(
        http.get("/api/authors", ({ request }) => {
          urls.push(new URL(request.url).search);
          return HttpResponse.json({ authors: [], tags: [], languages: [] });
        }),
      );
      return urls;
    }

    it("снимает единственный выбранный фильтр и перезапрашивает без него", async () => {
      const user = userEvent.setup();
      const urls = trackAuthorRequests();

      renderWithProviders(
        <>
          <LocationProbe />
          <AuthorsPage />
        </>,
        { initialEntries: ["/authors?tagIds=26"] },
      );
      await waitFor(() => expect(urls).toEqual(["?tagIds=26"]));

      await user.click(await screen.findByText("Сбросить все"));

      expect(screen.getByTestId("loc").textContent).toBe("/authors");
      await waitFor(() => expect(urls).toEqual(["?tagIds=26", ""]));
    });

    it("снимает оба фильтра за одно нажатие", async () => {
      const user = userEvent.setup();
      const urls = trackAuthorRequests();

      renderWithProviders(
        <>
          <LocationProbe />
          <AuthorsPage />
        </>,
        { initialEntries: ["/authors?tagIds=26&language=ru"] },
      );
      await waitFor(() => expect(urls).toHaveLength(1));

      await user.click(await screen.findByText("Сбросить все"));

      expect(screen.getByTestId("loc").textContent).toBe("/authors");
      await waitFor(() => expect(urls[urls.length - 1]).toBe(""));
    });

    it("снимает и ключ, для которого на странице нет чипа", async () => {
      // authorIds на /authors чипом не показывается (filterKeys = tagIds, language),
      // но из адреса читается и в запрос уходит — снять его тоже должно быть чем.
      const user = userEvent.setup();
      const urls = trackAuthorRequests();

      renderWithProviders(
        <>
          <LocationProbe />
          <AuthorsPage />
        </>,
        { initialEntries: ["/authors?authorIds=1"] },
      );
      await waitFor(() => expect(urls).toEqual(["?authorIds=1"]));

      await user.click(await screen.findByText("Сбросить все"));

      expect(screen.getByTestId("loc").textContent).toBe("/authors");
      await waitFor(() => expect(urls).toEqual(["?authorIds=1", ""]));
    });
  });

  describe("«Сбросить все» — мобильная раскладка", () => {
    // У мобильной панели своя копия кнопки и своего обработчика сброса —
    // спека требует одинакового поведения в обоих исполнениях.
    beforeEach(() => {
      setupMobileViewport();
    });

    afterEach(() => {
      teardownViewport();
    });

    it("снимает все фильтры за одно нажатие", async () => {
      const user = userEvent.setup();
      const urls: string[] = [];
      server.use(
        http.get("/api/authors", ({ request }) => {
          urls.push(new URL(request.url).search);
          return HttpResponse.json({ authors: [], tags: [], languages: [] });
        }),
      );

      renderWithProviders(
        <>
          <LocationProbe />
          <AuthorsPage />
        </>,
        { initialEntries: ["/authors?tagIds=26&language=ru"] },
      );
      await waitFor(() => expect(urls).toHaveLength(1));
      // Убеждаемся, что рендерится именно мобильный заголовок (у него своя панель):
      // кнопка бургер-меню есть только в нём.
      expect(screen.getByRole("button", { name: "Открыть меню" })).toBeInTheDocument();

      await user.click(await screen.findByRole("button", { name: /Сбросить все/ }));

      expect(screen.getByTestId("loc").textContent).toBe("/authors");
      await waitFor(() => expect(urls[urls.length - 1]).toBe(""));
    });
  });
});
