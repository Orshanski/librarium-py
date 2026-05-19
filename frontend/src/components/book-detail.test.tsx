// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { setupMobileViewport, teardownViewport } from "@/test/mobile-viewport";
import { renderWithProviders } from "@/test/render";
import { domainEvents } from "@/domain/events";
import BookDetail from "./book-detail";
import type { BookDetail as BookDetailType } from "../types";

// console.warn / console.error silencing is provided by the global
// test/setup.ts beforeEach hook — no per-describe spies needed here.

const mockBook: BookDetailType = {
  id: 7,
  title: "Test Book",
  authors: [{ id: 1, name: "Test Author" }],
  series: null,
  seriesNumber: null,
  rating: null,
  isRead: false,
  coverPath: "/api/covers/7",
  sortTitle: null,
  description: null,
  language: "ru",
  publisher: null,
  pubDate: null,
  tags: [],
  addedAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const catalogOrigin = { type: "catalog" as const, url: "/", label: "Каталог" };

function renderBookDetail(book: BookDetailType = mockBook) {
  return renderWithProviders(
    <BookDetail book={book} seriesBooks={[]} formats={[]} isbn={null} bookOrigin={catalogOrigin} />
  );
}

// Build a handler that holds the request until `release()` is invoked, then
// resolves with a 500. Common optimistic-rollback pattern.
function makeHoldUntilReleased500() {
  let release!: () => void;
  const inFlight = new Promise<void>((r) => {
    release = r;
  });
  const handler = async () => {
    await inFlight;
    return HttpResponse.json({ detail: "Server error" }, { status: 500 });
  };
  return { release: () => release(), handler };
}

describe("book-detail — shelves", () => {
  it("add book → 500 → UI reverts state (shelf unchecked again)", async () => {
    const user = userEvent.setup();
    const { release, handler } = makeHoldUntilReleased500();

    server.use(
      http.get("/api/shelves", ({ request }) => {
        const url = new URL(request.url);
        const bookId = url.searchParams.get("bookId");
        if (bookId) {
          return HttpResponse.json({
            shelves: [{ id: 1, name: "Wishlist", isSystem: false }],
            bookShelves: [{ id: 1, hasBook: false }],
          });
        }
        return HttpResponse.json({ shelves: [] });
      }),
      http.post("/api/shelves/:shelfId/books", handler)
    );

    renderBookDetail();

    const shelfButton = screen.getByRole("button", { name: /на полку/i });
    await user.click(shelfButton);

    await waitFor(() => {
      expect(screen.getByText("Wishlist")).toBeInTheDocument();
    });

    const checkbox = screen.getByRole("checkbox", { name: /wishlist/i });
    expect(checkbox).not.toBeChecked();

    // Click to add — triggers optimistic update (checked), then 500 → revert
    await user.click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());

    release();

    await waitFor(() => {
      expect(checkbox).not.toBeChecked();
    });
  });

  it("remove book → 500 → UI reverts state (shelf checked again)", async () => {
    const user = userEvent.setup();
    const { release, handler } = makeHoldUntilReleased500();

    server.use(
      http.get("/api/shelves", ({ request }) => {
        const url = new URL(request.url);
        const bookId = url.searchParams.get("bookId");
        if (bookId) {
          return HttpResponse.json({
            shelves: [{ id: 1, name: "Wishlist", isSystem: false }],
            bookShelves: [{ id: 1, hasBook: true }],
          });
        }
        return HttpResponse.json({ shelves: [] });
      }),
      http.delete("/api/shelves/:shelfId/books/:bookId", handler)
    );

    renderBookDetail();

    const shelfButton = screen.getByRole("button", { name: /на полку/i });
    await user.click(shelfButton);

    await waitFor(() => {
      expect(screen.getByText("Wishlist")).toBeInTheDocument();
    });

    const checkbox = screen.getByRole("checkbox", { name: /wishlist/i });
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });

    // Click to remove — triggers optimistic update (unchecked), then 500 → revert
    await user.click(checkbox);

    await waitFor(() => expect(checkbox).not.toBeChecked());

    release();

    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });
  });
});

describe("book-detail — cover display", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders cover img with src from book.coverPath", () => {
    renderBookDetail();

    const img = screen.getByRole("img", { name: mockBook.title });
    expect(img).toBeInTheDocument();
    expect((img as HTMLImageElement).getAttribute("src")).toBe("/api/covers/7");
  });

  it("cover img src uses correct /api/covers/:id pattern (no full=1 for display)", () => {
    const bookWithCover: BookDetailType = { ...mockBook, id: 99, coverPath: "/api/covers/99" };
    renderBookDetail(bookWithCover);

    const img = screen.getByRole("img", { name: bookWithCover.title });
    expect((img as HTMLImageElement).getAttribute("src")).toBe("/api/covers/99");
  });
});

describe("book-detail — books", () => {
  beforeEach(() => {
    domainEvents.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rating: click star span → PUT /api/books/:id/rating fires and publishes event", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    const events: Array<{ bookId: number; rating: number | null }> = [];
    domainEvents.subscribe("bookRatingChanged", (payload) => events.push(payload));

    server.use(
      http.put("/api/books/:id/rating", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    renderBookDetail({ ...mockBook, rating: 3 });

    const starSpans = screen.getAllByText("★");
    expect(starSpans.length).toBe(5);

    await user.click(starSpans[4]);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect((capturedBody as { rating: number }).rating).toBe(5);
      expect(events).toEqual([{ bookId: 7, rating: 5 }]);
    });
  });

  it("rating optimistic: on 500 → rollback to previous value", async () => {
    const user = userEvent.setup();
    const { release, handler } = makeHoldUntilReleased500();

    server.use(http.put("/api/books/:id/rating", handler));

    renderBookDetail({ ...mockBook, rating: 3 });

    const starSpans = screen.getAllByText("★");
    expect(starSpans.length).toBe(5);

    // Initial rating is 3
    await waitFor(() => {
      const ratingEl = screen.getByTestId("book-rating");
      expect(ratingEl.dataset.rating).toBe("3");
    });

    // Click the 1st star → optimistic update to 1
    await user.click(starSpans[0]);

    await waitFor(() => {
      const ratingEl = screen.getByTestId("book-rating");
      expect(ratingEl.dataset.rating).toBe("1");
    });

    release();

    await waitFor(() => {
      const ratingEl = screen.getByTestId("book-rating");
      expect(ratingEl.dataset.rating).toBe("3");
    });
  });

  it("read status: click 'Не прочитано' → PUT /api/books/:id/read fires and publishes event", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    const events: Array<{ bookId: number; isRead: boolean }> = [];
    domainEvents.subscribe("bookReadChanged", (payload) => events.push(payload));

    server.use(
      http.put("/api/books/:id/read", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    renderBookDetail();

    const readButton = screen.getByText(/не прочитано/i);
    await user.click(readButton);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect((capturedBody as { isRead: boolean }).isRead).toBe(true);
      expect(events).toEqual([{ bookId: 7, isRead: true }]);
    });
  });

  it("read status optimistic: on 500 → rollback to previous state", async () => {
    const user = userEvent.setup();
    const { release, handler } = makeHoldUntilReleased500();

    server.use(http.put("/api/books/:id/read", handler));

    renderBookDetail();

    expect(screen.getByText(/не прочитано/i)).toBeInTheDocument();

    const readButton = screen.getByText(/не прочитано/i);
    await user.click(readButton);

    await waitFor(() => {
      expect(screen.getByText(/✓ Прочитано/i)).toBeInTheDocument();
    });

    release();

    await waitFor(() => {
      expect(screen.getByText(/не прочитано/i)).toBeInTheDocument();
    });
  });

  it("delete: click 'Удалить' → confirm dialog → DELETE /api/books/:id fires and publishes event", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;
    const events: Array<{ bookId: number }> = [];
    domainEvents.subscribe("bookDeleted", (payload) => events.push(payload));

    server.use(
      http.delete("/api/books/:id", () => {
        deleteCalled = true;
        return HttpResponse.json({ ok: true });
      })
    );

    renderBookDetail();

    const deleteButton = await screen.findByRole("button", { name: "Удалить" });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/удалить.*test book/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByTestId("confirm-dialog-submit");
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(deleteCalled).toBe(true);
      expect(events).toEqual([{ bookId: 7 }]);
    });
  });

  it("delete: on 500 — component stays mounted (no crash)", async () => {
    const user = userEvent.setup();

    server.use(
      http.delete("/api/books/:id", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    renderBookDetail();

    const deleteButton = await screen.findByRole("button", { name: "Удалить" });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/удалить.*test book/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByTestId("confirm-dialog-submit");
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });
  });
});

// Контейнер `book-detail.tsx` ветвится на основе `useIsMobile()`:
// `return isMobile ? <MobileBookDetail .../> : <DesktopBookDetail .../>;`.
// Поэтому setupMobileViewport() в beforeEach гарантирует рендер
// именно `MobileBookDetail`, и RED-фейл «есть ссылка «Ред.»» именно
// о mobile-ветке, не desktop.
describe("book-detail — mobile admin actions", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setupMobileViewport();
  });
  afterEach(() => teardownViewport());

  it("на mobile админ видит «Удалить», но не «Ред.»", async () => {
    renderBookDetail();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: "Ред." })).not.toBeInTheDocument();
  });
});
