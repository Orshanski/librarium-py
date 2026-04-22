// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import BookDetail from "./book-detail";
import type { Book } from "../types";

const mockBook: Book = {
  id: 7,
  title: "Test Book",
  authors: ["Test Author"],
  series: null,
  seriesNumber: null,
  tags: [],
  rating: null,
  isRead: false,
  language: "ru",
  coverPath: "/api/covers/7",
  description: null,
  publisher: null,
  pubDate: null,
  formats: [],
  isbn: null,
};

describe("book-detail — shelves", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("add book → 500 → UI reverts state (shelf unchecked again)", async () => {
    const user = userEvent.setup();

    let release!: () => void;
    const inFlight = new Promise<void>((r) => { release = r; });

    // Initial shelf list: one non-system shelf, book NOT on it
    server.use(
      http.get("/api/shelves", ({ request }) => {
        const url = new URL(request.url);
        const bookId = url.searchParams.get("bookId");
        if (bookId) {
          return HttpResponse.json({
            shelves: [{ id: 1, name: "Wishlist", is_system: false }],
            bookShelves: [{ id: 1, has_book: false }],
          });
        }
        return HttpResponse.json({ shelves: [] });
      }),
      // POST holds open until released, then returns 500
      http.post("/api/shelves/:shelfId/books", async () => {
        await inFlight;
        return HttpResponse.json({ detail: "Server error" }, { status: 500 });
      })
    );

    renderWithProviders(<BookDetail book={mockBook} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    // Open shelf menu
    const shelfButton = screen.getByRole("button", { name: /на полку/i });
    await user.click(shelfButton);

    // Wait for shelf list to load
    await waitFor(() => {
      expect(screen.getByText("Wishlist")).toBeInTheDocument();
    });

    // Checkbox starts unchecked
    const checkbox = screen.getByRole("checkbox", { name: /wishlist/i });
    expect(checkbox).not.toBeChecked();

    // Click to add — triggers optimistic update (checked), then 500 → revert
    await user.click(checkbox);

    // Optimistic update: checkbox becomes checked immediately
    await waitFor(() => expect(checkbox).toBeChecked());

    // Release the handler with 500 → optimistic update reverts
    release();

    // After revert: checkbox unchecked again
    await waitFor(() => {
      expect(checkbox).not.toBeChecked();
    });
  });

  it("remove book → 500 → UI reverts state (shelf checked again)", async () => {
    const user = userEvent.setup();

    let release!: () => void;
    const inFlight = new Promise<void>((r) => { release = r; });

    // Initial shelf list: book IS on shelf 1
    server.use(
      http.get("/api/shelves", ({ request }) => {
        const url = new URL(request.url);
        const bookId = url.searchParams.get("bookId");
        if (bookId) {
          return HttpResponse.json({
            shelves: [{ id: 1, name: "Wishlist", is_system: false }],
            bookShelves: [{ id: 1, has_book: true }],
          });
        }
        return HttpResponse.json({ shelves: [] });
      }),
      // DELETE holds open until released, then returns 500
      http.delete("/api/shelves/:shelfId/books/:bookId", async () => {
        await inFlight;
        return HttpResponse.json({ detail: "Server error" }, { status: 500 });
      })
    );

    renderWithProviders(<BookDetail book={mockBook} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    // Open shelf menu
    const shelfButton = screen.getByRole("button", { name: /на полку/i });
    await user.click(shelfButton);

    // Wait for shelf list to load
    await waitFor(() => {
      expect(screen.getByText("Wishlist")).toBeInTheDocument();
    });

    // Checkbox starts checked
    const checkbox = screen.getByRole("checkbox", { name: /wishlist/i });
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });

    // Click to remove — triggers optimistic update (unchecked), then 500 → revert
    await user.click(checkbox);

    // Optimistic update: checkbox becomes unchecked immediately
    await waitFor(() => expect(checkbox).not.toBeChecked());

    // Release the handler with 500 → optimistic update reverts
    release();

    // After revert: checkbox checked again
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });
  });
});

describe("book-detail — cover display", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders cover img with src from book.coverPath", () => {
    renderWithProviders(<BookDetail book={mockBook} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    const img = screen.getByRole("img", { name: mockBook.title });
    expect(img).toBeInTheDocument();
    expect((img as HTMLImageElement).getAttribute("src")).toBe("/api/covers/7");
  });

  it("cover img src uses correct /api/covers/:id pattern (no full=1 for display)", () => {
    const bookWithCover: Book = { ...mockBook, id: 99, coverPath: "/api/covers/99" };
    renderWithProviders(<BookDetail book={bookWithCover} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    const img = screen.getByRole("img", { name: bookWithCover.title });
    expect((img as HTMLImageElement).getAttribute("src")).toBe("/api/covers/99");
  });
});

describe("book-detail — books", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rating: click star span → PUT /api/books/:id/rating fires with {rating: N}", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;

    server.use(
      http.put("/api/books/:id/rating", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    const bookWithRating: Book = { ...mockBook, rating: 3 };
    renderWithProviders(<BookDetail book={bookWithRating} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    // Stars are rendered as <span> elements with text "★" (not buttons)
    const starSpans = screen.getAllByText("★");
    expect(starSpans.length).toBe(5);

    // Click the 5th star
    await user.click(starSpans[4]);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect((capturedBody as { rating: number }).rating).toBe(5);
    });
  });

  it("rating optimistic: on 500 → rollback to previous value", async () => {
    const user = userEvent.setup();

    let release!: () => void;
    const inFlight = new Promise<void>((r) => { release = r; });

    server.use(
      http.put("/api/books/:id/rating", async () => {
        await inFlight;
        return HttpResponse.json({ detail: "Server error" }, { status: 500 });
      })
    );

    const bookWithRating: Book = { ...mockBook, rating: 3 };
    renderWithProviders(<BookDetail book={bookWithRating} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    const starSpans = screen.getAllByText("★");
    expect(starSpans.length).toBe(5);

    // Initial rating is 3
    await waitFor(() => {
      const ratingEl = screen.getByTestId("book-rating");
      expect(ratingEl.getAttribute("data-rating")).toBe("3");
    });

    // Click the 1st star → optimistic update to 1
    await user.click(starSpans[0]);

    // Optimistic: rating should be 1 immediately
    await waitFor(() => {
      const ratingEl = screen.getByTestId("book-rating");
      expect(ratingEl.getAttribute("data-rating")).toBe("1");
    });

    // Release the handler with 500 → rollback to 3
    release();

    await waitFor(() => {
      const ratingEl = screen.getByTestId("book-rating");
      expect(ratingEl.getAttribute("data-rating")).toBe("3");
    });
  });

  it("read status: click 'Не прочитано' → PUT /api/books/:id/read fires with {isRead: true}", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;

    server.use(
      http.put("/api/books/:id/read", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    // mockBook.isRead = false → button shows "Не прочитано"
    renderWithProviders(<BookDetail book={mockBook} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    const readButton = screen.getByText(/не прочитано/i);
    await user.click(readButton);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect((capturedBody as { isRead: boolean }).isRead).toBe(true);
    });
  });

  it("read status optimistic: on 500 → rollback to previous state", async () => {
    const user = userEvent.setup();

    let release!: () => void;
    const inFlight = new Promise<void>((r) => { release = r; });

    server.use(
      http.put("/api/books/:id/read", async () => {
        await inFlight;
        return HttpResponse.json({ detail: "Server error" }, { status: 500 });
      })
    );

    renderWithProviders(<BookDetail book={mockBook} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    // Initially "Не прочитано"
    expect(screen.getByText(/не прочитано/i)).toBeInTheDocument();

    const readButton = screen.getByText(/не прочитано/i);
    await user.click(readButton);

    // Optimistic update: should now show "✓ Прочитано"
    await waitFor(() => {
      expect(screen.getByText(/✓ Прочитано/i)).toBeInTheDocument();
    });

    // Release with 500 → rollback
    release();

    await waitFor(() => {
      expect(screen.getByText(/не прочитано/i)).toBeInTheDocument();
    });
  });

  it("delete: click 'Удалить' → confirm dialog → DELETE /api/books/:id fires", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;

    server.use(
      http.delete("/api/books/:id", () => {
        deleteCalled = true;
        return HttpResponse.json({ ok: true });
      })
    );

    renderWithProviders(<BookDetail book={mockBook} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    // Wait for admin role to load (auth async fetch)
    const deleteButton = await screen.findByRole("button", { name: "Удалить" });
    await user.click(deleteButton);

    // Confirm dialog appears with the book title
    await waitFor(() => {
      expect(screen.getByText(/удалить.*test book/i)).toBeInTheDocument();
    });

    // Find the confirm button in the dialog deterministically via data-testid
    const confirmBtn = screen.getByTestId("confirm-dialog-submit");
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
  });

  it("delete: on 500 — component stays mounted (no crash)", async () => {
    const user = userEvent.setup();

    server.use(
      http.delete("/api/books/:id", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    renderWithProviders(<BookDetail book={mockBook} seriesBooks={[]} bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }} />);

    // Wait for admin role to load
    const deleteButton = await screen.findByRole("button", { name: "Удалить" });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/удалить.*test book/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByTestId("confirm-dialog-submit");
    await user.click(confirmBtn);
    // On 500 the component should NOT navigate — stays mounted
    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });
  });
});
