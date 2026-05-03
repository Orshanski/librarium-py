import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { domainEvents } from "@/domain/events";
import BookShelfMenu from "../book-shelf-menu";

describe("BookShelfMenu", () => {
  beforeEach(() => {
    domainEvents.clear();
    server.use(
      http.get("/api/shelves", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("bookId") === "7") {
          return HttpResponse.json({
            shelves: [
              { id: 1, name: "Wishlist", isSystem: false },
              { id: 2, name: "Прочитанное", isSystem: false },
            ],
            bookShelves: [
              { id: 1, hasBook: true },
              { id: 2, hasBook: false },
            ],
          });
        }
        if (url.searchParams.get("bookId") === "8") {
          return HttpResponse.json({
            shelves: [{ id: 3, name: "Book 8 shelf", isSystem: false }],
            bookShelves: [{ id: 3, hasBook: true }],
          });
        }
        return HttpResponse.json({ shelves: [], bookShelves: [] });
      }),
    );
  });

  it("keeps the dropdown hidden by default", () => {
    renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);

    expect(screen.queryByText("Wishlist")).toBeNull();
  });

  it("loads shelves and opens dropdown on trigger click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);

    await user.click(screen.getByRole("button", { name: /на полку/i }));

    expect(await screen.findByText("Wishlist")).toBeInTheDocument();
    expect(screen.getByText("Прочитанное")).toBeInTheDocument();
  });

  it("marks shelves that already contain the book as checked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);

    await user.click(screen.getByRole("button", { name: /на полку/i }));

    expect(await screen.findByRole("checkbox", { name: /wishlist/i })).toBeChecked();
  });

  it("removes from a shelf optimistically and reverts after server failure", async () => {
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.delete("/api/shelves/:shelfId/books/:bookId", async () => {
        await inFlight;
        return HttpResponse.json({ detail: "Server error" }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);

    await user.click(screen.getByRole("button", { name: /на полку/i }));
    const checkbox = await screen.findByRole("checkbox", { name: /wishlist/i });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
    release();
    await waitFor(() => expect(checkbox).toBeChecked());
  });

  it("adds to a shelf optimistically and reverts after server failure", async () => {
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post("/api/shelves/:shelfId/books", async () => {
        await inFlight;
        return HttpResponse.json({ detail: "Server error" }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);

    await user.click(screen.getByRole("button", { name: /на полку/i }));
    const checkbox = await screen.findByRole("checkbox", { name: /прочитанное/i });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    release();
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });

  it("publishes shelf membership event after successful toggle", async () => {
    server.use(
      http.post("/api/shelves/:shelfId/books", () => HttpResponse.json({ ok: true })),
    );
    const events: Array<{ shelfId: number; bookId: number; hasBook: boolean }> = [];
    domainEvents.subscribe("shelfMembershipChanged", (payload) => events.push(payload));
    const user = userEvent.setup();
    renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);

    await user.click(screen.getByRole("button", { name: /на полку/i }));
    const checkbox = await screen.findByRole("checkbox", { name: /прочитанное/i });
    await user.click(checkbox);

    await waitFor(() => {
      expect(events).toEqual([{ shelfId: 2, bookId: 7, hasBook: true }]);
    });
  });

  it("rolls back only the shelf whose older mutation failed", async () => {
    let releaseRemove!: () => void;
    const removeInFlight = new Promise<void>((resolve) => {
      releaseRemove = resolve;
    });
    server.use(
      http.delete("/api/shelves/:shelfId/books/:bookId", async () => {
        await removeInFlight;
        return HttpResponse.json({ detail: "Server error" }, { status: 500 });
      }),
      http.post("/api/shelves/:shelfId/books", () => HttpResponse.json({ ok: true })),
    );
    const user = userEvent.setup();
    renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);

    await user.click(screen.getByRole("button", { name: /на полку/i }));
    const wishlist = await screen.findByRole("checkbox", { name: /wishlist/i });
    const readShelf = await screen.findByRole("checkbox", { name: /прочитанное/i });

    await user.click(wishlist);
    await waitFor(() => expect(wishlist).not.toBeChecked());
    await user.click(readShelf);
    await waitFor(() => expect(readShelf).toBeChecked());

    releaseRemove();

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /wishlist/i })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: /прочитанное/i })).toBeChecked();
  });

  it("rolls back an older failed add even if another shelf was toggled later", async () => {
    let releaseAdd!: () => void;
    const addInFlight = new Promise<void>((resolve) => {
      releaseAdd = resolve;
    });
    server.use(
      http.post("/api/shelves/:shelfId/books", async () => {
        await addInFlight;
        return HttpResponse.json({ detail: "Server error" }, { status: 500 });
      }),
      http.delete("/api/shelves/:shelfId/books/:bookId", () => HttpResponse.json({ ok: true })),
    );
    const user = userEvent.setup();
    renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);

    await user.click(screen.getByRole("button", { name: /на полку/i }));
    const wishlist = await screen.findByRole("checkbox", { name: /wishlist/i });
    const readShelf = await screen.findByRole("checkbox", { name: /прочитанное/i });

    await user.click(readShelf);
    await waitFor(() => expect(readShelf).toBeChecked());
    await user.click(wishlist);
    await waitFor(() => expect(wishlist).not.toBeChecked());

    releaseAdd();

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /прочитанное/i })).not.toBeChecked());
    expect(screen.getByRole("checkbox", { name: /wishlist/i })).not.toBeChecked();
  });

  it("exposes menu ARIA attributes on the trigger", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);
    const button = screen.getByRole("button", { name: /на полку/i });

    expect(button).toHaveAttribute("aria-haspopup", "true");
    expect(button).toHaveAttribute("aria-expanded", "false");

    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(button).toHaveAttribute("aria-controls"));
  });

  it("closes the dropdown on outside pointer down", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <BookShelfMenu bookId={7} compact={false} />
        <button type="button" data-testid="outside">
          Outside
        </button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /на полку/i }));
    await screen.findByText("Wishlist");

    fireEvent.pointerDown(screen.getByTestId("outside"));

    await waitFor(() => expect(screen.queryByText("Wishlist")).toBeNull());
  });

  it("resets shelf state when bookId changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<BookShelfMenu bookId={7} compact={false} />);

    await user.click(screen.getByRole("button", { name: /на полку/i }));
    expect(await screen.findByText("Wishlist")).toBeInTheDocument();

    rerender(<BookShelfMenu bookId={8} compact={false} />);

    expect(screen.queryByText("Wishlist")).toBeNull();
    await user.click(screen.getByRole("button", { name: /на полку/i }));
    expect(await screen.findByRole("checkbox", { name: /book 8 shelf/i })).toBeChecked();
  });
});
