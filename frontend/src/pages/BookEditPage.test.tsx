// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route, useLocation } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import BookEditPage from "./BookEditPage";

const mockRawBook = {
  id: 42,
  title: "Тестовая книга",
  authors: "Автор Тестов",
  series_name: null,
  series_number: null,
  tags: null,
  rating: null,
  language: "ru",
  cover_path: null,
  description: null,
  publisher: null,
  pub_date: null,
  updated_at: null,
  is_read: null,
};

function setupAllHandlers() {
  server.use(
    http.get("/api/books/:id", () =>
      HttpResponse.json({
        book: mockRawBook,
        files: [{ format: "epub", file_size: 512000 }],
        identifiers: [],
      })
    ),
    http.get("/api/filter-options/authors", () =>
      HttpResponse.json({ authors: [{ id: 1, name: "Автор Тестов" }] })
    ),
    http.get("/api/filter-options/series", () =>
      HttpResponse.json({ series: [] })
    ),
    http.get("/api/filter-options/tags", () =>
      HttpResponse.json({ tags: [] })
    ),
    http.get("/api/filter-options/languages", () =>
      HttpResponse.json({ languages: [{ name: "ru" }, { name: "en" }] })
    ),
    http.get("/api/publishers", () =>
      HttpResponse.json({ publishers: [] })
    ),
  );
}

describe("BookEditPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("happy: all 6 fetches succeed — edit form renders with book title", async () => {
    setupAllHandlers();

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
      </Routes>,
      { initialEntries: ["/book/42/edit"] }
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    });
  });

  it("save success: PUT /api/books/:id fires and navigates", async () => {
    setupAllHandlers();
    let putBody: unknown = null;

    server.use(
      http.put("/api/books/:id", async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
        <Route path="/book/:id" element={<div>Book Detail</div>} />
      </Routes>,
      { initialEntries: ["/book/42/edit"] }
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const saveBtn = screen.getByRole("button", { name: /сохранить/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(putBody).not.toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByText("Book Detail")).toBeInTheDocument();
    });
  });

  it("save: navigate state.origin взят из editOrigin.bookOrigin (цепочка crumb к источнику)", async () => {
    setupAllHandlers();
    server.use(
      http.put("/api/books/:id", () => HttpResponse.json({ ok: true })),
    );

    let capturedState: unknown = null;
    function LocationSpy() {
      const location = useLocation();
      capturedState = location.state;
      return <div>Book Detail state-spy</div>;
    }

    const editOrigin = {
      type: "book" as const,
      url: "/book/42",
      label: "Тестовая книга",
      bookOrigin: {
        type: "author" as const,
        url: "/authors/7",
        label: "Автор Тестов",
      },
    };

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
        <Route path="/book/:id" element={<LocationSpy />} />
      </Routes>,
      { initialEntries: [{ pathname: "/book/42/edit", state: { origin: editOrigin } }] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /сохранить/i }));

    await waitFor(() => {
      expect(screen.getByText("Book Detail state-spy")).toBeInTheDocument();
    });

    expect(capturedState).toEqual({ origin: editOrigin.bookOrigin });
  });

  it("save без editOrigin в state: navigate state.origin = fallback Каталог", async () => {
    setupAllHandlers();
    server.use(
      http.put("/api/books/:id", () => HttpResponse.json({ ok: true })),
    );

    let capturedState: unknown = null;
    function LocationSpy() {
      const location = useLocation();
      capturedState = location.state;
      return <div>Book Detail state-spy</div>;
    }

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
        <Route path="/book/:id" element={<LocationSpy />} />
      </Routes>,
      { initialEntries: ["/book/42/edit"] },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Тестовая книга")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /сохранить/i }));

    await waitFor(() => {
      expect(screen.getByText("Book Detail state-spy")).toBeInTheDocument();
    });

    expect(capturedState).toEqual({
      origin: { type: "catalog", url: "/", label: "Каталог" },
    });
  });

  it("shows not-found when book fetch returns 404", async () => {
    server.use(
      http.get("/api/books/:id", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      ),
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ authors: [] })
      ),
      http.get("/api/filter-options/series", () =>
        HttpResponse.json({ series: [] })
      ),
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: [] })
      ),
      http.get("/api/filter-options/languages", () =>
        HttpResponse.json({ languages: [] })
      ),
      http.get("/api/publishers", () =>
        HttpResponse.json({ publishers: [] })
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/book/:id/edit" element={<BookEditPage />} />
      </Routes>,
      { initialEntries: ["/book/999/edit"] }
    );

    await waitFor(() => {
      const elements = screen.queryAllByText("Книга не найдена");
      expect(elements.length).toBeGreaterThan(0);
    });
  });
});
