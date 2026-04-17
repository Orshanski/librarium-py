// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
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

    renderWithProviders(<BookDetail book={mockBook} seriesBooks={[]} />);

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

    renderWithProviders(<BookDetail book={mockBook} seriesBooks={[]} />);

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
