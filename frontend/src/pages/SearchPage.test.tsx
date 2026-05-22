// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { domainEvents } from "@/domain/events";
import { registerScrollInvalidationHandlers } from "@/scroll/list-scroll-validity";
import type { Book } from "../types";
import SearchPage from "./SearchPage";

// Shared fixture factory — central place to add fields if Book grows.
// Tests that need a book pass only the overrides they care about.
function makeSearchHit(overrides: Partial<Book> = {}): Book {
  return {
    id: 1,
    title: "Example Book",
    authors: [],
    coverPath: "",
    series: null,
    seriesNumber: null,
    rating: null,
    isRead: false,
    tags: [],
    ...overrides,
  };
}

describe("SearchPage — integration", () => {
  it("renders API results for a query", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json({
          books: [makeSearchHit({ title: "Example Book" })],
          authors: [],
          series: [],
        }),
      ),
    );
    renderWithProviders(<SearchPage />, { initialEntries: ["/search?q=example"] });
    await waitFor(() =>
      expect(screen.getByText("Example Book")).toBeInTheDocument(),
    );
  });

  it("shows inline error on 500 and does NOT render results", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );
    renderWithProviders(<SearchPage />, { initialEntries: ["/search?q=example"] });

    // Inline error visible.
    await waitFor(() =>
      expect(screen.getByText(/ошибка поиска/i)).toBeInTheDocument(),
    );
    // And happy-path content should NOT be on screen (error replaces results, not appends).
    expect(screen.queryByText("Example Book")).not.toBeInTheDocument();
  });

  it("shows placeholder when query is empty", () => {
    renderWithProviders(<SearchPage />, { initialEntries: ["/search"] });
    expect(
      screen.getByText(/введите запрос в поле поиска/i),
    ).toBeInTheDocument();
  });

  it("resets saved search scroll after structural book events", async () => {
    domainEvents.clear();
    const unsubscribe = registerScrollInvalidationHandlers(domainEvents);
    const main = document.createElement("main");
    document.body.appendChild(main);
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json({
          books: [makeSearchHit({ title: "Dune" })],
          authors: [],
          series: [],
        }),
      ),
    );

    const first = renderWithProviders(<SearchPage />, { initialEntries: ["/search?q=dune"] });
    await waitFor(() => expect(screen.getByText("Dune")).toBeInTheDocument());
    main.scrollTop = 360;
    fireEvent.click(main);
    first.unmount();

    domainEvents.publish("bookCreated", { bookId: 42, book: { id: 42, title: "New Dune" } });

    renderWithProviders(<SearchPage />, {
      initialEntries: [{ pathname: "/search", search: "?q=dune", state: { crumb: true } }],
    });
    await waitFor(() => expect(screen.getByText("Dune")).toBeInTheDocument());

    expect(main.scrollTop).toBe(0);
    unsubscribe();
    document.body.removeChild(main);
  });
});
