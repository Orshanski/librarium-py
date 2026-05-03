// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";
import { domainEvents } from "@/domain/events";
import ShelfPage from "./ShelfPage";

describe("ShelfPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    metadataCache.clear();
    domainEvents.clear();
  });

  it("renders shelf title and books on successful fetch", async () => {
    server.use(
      http.get("/api/shelves/:id", () =>
        HttpResponse.json({
          shelf: { id: 42, name: "My Shelf", isSystem: false, systemCode: null },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: ["Frank Herbert"],
              series: null,
              seriesNumber: null,
              tags: [],
              tagIds: [],
              authorIds: [],
              rating: null,
              isRead: false,
              language: "",
              coverPath: "",
              description: null,
              publisher: null,
              pubDate: null,
              formats: [],
              isbn: null,
            },
            {
              id: 102,
              title: "Foundation",
              authors: ["Isaac Asimov"],
              series: null,
              seriesNumber: null,
              tags: [],
              tagIds: [],
              authorIds: [],
              rating: null,
              isRead: false,
              language: "",
              coverPath: "",
              description: null,
              publisher: null,
              pubDate: null,
              formats: [],
              isbn: null,
            },
          ],
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/42"] }
    );

    await waitFor(() => {
      expect(screen.getByText("My Shelf")).toBeInTheDocument();
    });

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Foundation")).toBeInTheDocument();
  });

  it("renders nothing crashy on 404", async () => {
    server.use(
      http.get("/api/shelves/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/999"] }
    );

    // Loading indicator disappears, no crash, no book grid
    await waitFor(() => {
      expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
    });

    // No book grid rendered (shelf is null → returns null)
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("publishes events after successful shelf book removal and shelf delete", async () => {
    const user = userEvent.setup();
    const membershipEvents: Array<{ shelfId: number; bookId: number; hasBook: boolean }> = [];
    const deleteEvents: Array<{ shelfId: number }> = [];
    domainEvents.subscribe("shelfMembershipChanged", (payload) => membershipEvents.push(payload));
    domainEvents.subscribe("shelfDeleted", (payload) => deleteEvents.push(payload));

    server.use(
      http.get("/api/shelves/:id", () =>
        HttpResponse.json({
          shelf: { id: 42, name: "My Shelf", isSystem: false, systemCode: null },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: [{ id: 1, name: "Frank Herbert" }],
              series: null,
              seriesNumber: null,
              tags: [],
              rating: null,
              isRead: false,
              language: "",
              coverPath: "",
              description: null,
              publisher: null,
              pubDate: null,
              updatedAt: null,
            },
          ],
        })
      ),
      http.delete("/api/shelves/:shelfId/books/:bookId", () => HttpResponse.json({ ok: true })),
      http.delete("/api/shelves/:id", () => HttpResponse.json({ ok: true })),
    );

    renderWithProviders(
      <Routes>
        <Route path="/" element={<div>Catalog</div>} />
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>,
      { initialEntries: ["/shelves/42"] }
    );

    await waitFor(() => expect(screen.getByText("Dune")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "✕" }));

    await waitFor(() => {
      expect(membershipEvents).toEqual([{ shelfId: 42, bookId: 101, hasBook: false }]);
    });

    await user.click(screen.getByRole("button", { name: "Удалить полку" }));
    await user.click(screen.getByTestId("confirm-dialog-submit"));

    await waitFor(() => {
      expect(deleteEvents).toEqual([{ shelfId: 42 }]);
    });
  });

  it("uses cached shelf detail on remount without refetch", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/shelves/:id", () => {
        requestCount += 1;
        return HttpResponse.json({
          shelf: { id: 42, name: "My Shelf", isSystem: false, systemCode: null },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: ["Frank Herbert"],
              series: null,
              seriesNumber: null,
              tags: [],
              tagIds: [],
              authorIds: [],
              rating: null,
              isRead: false,
              language: "",
              coverPath: "",
              description: null,
              publisher: null,
              pubDate: null,
              formats: [],
              isbn: null,
            },
          ],
        });
      })
    );

    const route = (
      <Routes>
        <Route path="/shelves/:id" element={<ShelfPage />} />
      </Routes>
    );

    const first = renderWithProviders(route, { initialEntries: ["/shelves/42"] });
    await waitFor(() => expect(screen.getByText("Dune")).toBeInTheDocument());
    first.unmount();

    renderWithProviders(route, { initialEntries: ["/shelves/42"] });

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  it("does not carry locally removed book ids across shelf navigation", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/shelves/:id", ({ params }) => {
        const { id } = params as { id: string };
        return HttpResponse.json({
          shelf: { id: Number(id), name: `Shelf ${id}`, isSystem: false, systemCode: null },
          books: [
            {
              id: 101,
              title: "Dune",
              authors: ["Frank Herbert"],
              series: null,
              seriesNumber: null,
              tags: [],
              tagIds: [],
              authorIds: [],
              rating: null,
              isRead: false,
              language: "",
              coverPath: "",
              description: null,
              publisher: null,
              pubDate: null,
              formats: [],
              isbn: null,
            },
          ],
        });
      }),
      http.delete("/api/shelves/:shelfId/books/:bookId", () => HttpResponse.json({ ok: true })),
    );

    renderWithProviders(
      <>
        <Link to="/shelves/43">Other shelf</Link>
        <Routes>
          <Route path="/shelves/:id" element={<ShelfPage />} />
        </Routes>
      </>,
      { initialEntries: ["/shelves/42"] },
    );

    await waitFor(() => expect(screen.getByText("Shelf 42")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "✕" }));
    await waitFor(() => expect(screen.queryByText("Dune")).not.toBeInTheDocument());

    await user.click(screen.getByRole("link", { name: "Other shelf" }));

    await waitFor(() => expect(screen.getByText("Shelf 43")).toBeInTheDocument());
    expect(screen.getByText("Dune")).toBeInTheDocument();
  });
});
