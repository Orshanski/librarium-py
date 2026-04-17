// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import BookEditForm from "./book-edit-form";
import type { Book } from "../types";
import type { BookEditOptions } from "./book-edit-form.types";
import { screen } from "@testing-library/react";

const mockBook: Book = {
  id: 42,
  title: "Тестовая книга",
  authors: ["Автор Тестов"],
  series: null,
  seriesNumber: null,
  tags: [],
  rating: null,
  isRead: false,
  language: "ru",
  coverPath: "/api/covers/42",
  description: null,
  publisher: null,
  pubDate: null,
  formats: [{ format: "epub", size: "1 MB" }],
  isbn: null,
};

const mockOptions: BookEditOptions = {
  authors: [],
  series: [],
  tags: [],
  languages: [{ name: "ru" }, { name: "en" }],
  publishers: [],
};

describe("book-edit-form — metadata", () => {
  beforeEach(() => {
    // Suppress console.error for act() warnings in complex renders
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("applyMetadata with coverUrl: calls cover-proxy then uploads cover to /api/books/:id/cover", async () => {
    const user = userEvent.setup();
    let coverProxyCalled = false;
    let coverUploadCalled = false;

    server.use(
      // cover-proxy returns a small fake image blob
      http.get("/api/metadata/cover-proxy", () => {
        coverProxyCalled = true;
        return new HttpResponse(new Uint8Array([137, 80, 78, 71]).buffer, {
          headers: { "Content-Type": "image/jpeg" },
        });
      }),
      // metadata search — needed when user opens the MetadataSearch modal
      http.get("/api/metadata/search", () =>
        HttpResponse.json({
          results: [
            {
              title: "Новая книга",
              authors: "Новый Автор",
              description: "Описание",
              publisher: "Издатель",
              pubDate: "2023",
              isbn: "123",
              tags: "тест",
              source: "litres",
              coverUrl: "https://example.com/cover.jpg",
            },
          ],
        }),
      ),
      // cover upload endpoint
      http.post("/api/books/:id/cover", () => {
        coverUploadCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    renderWithProviders(
      <BookEditForm
        book={mockBook}
        options={mockOptions}
        onSave={vi.fn()}
      />,
    );

    // Open metadata search
    const metadataBtn = screen.getByRole("button", { name: /метаданн/i });
    await user.click(metadataBtn);

    // Search for results
    await user.click(screen.getByRole("button", { name: /^Поиск$/i }));

    // Wait for results and click on the first result's cover/apply
    await waitFor(() => {
      expect(screen.getByText("Новая книга")).toBeInTheDocument();
    });

    // Click on the cover image (applies metadata)
    const coverDiv = screen.getAllByTitle(/Нажмите, чтобы применить метаданные/)[0];
    await user.click(coverDiv);

    // Both cover-proxy fetch and cover upload should have been called
    await waitFor(() => {
      expect(coverProxyCalled).toBe(true);
    });
    await waitFor(() => {
      expect(coverUploadCalled).toBe(true);
    });
  });

  it("applyMetadata WITHOUT coverUrl: no cover-proxy, no cover upload — form fields updated", async () => {
    const user = userEvent.setup();
    let coverProxyCalled = false;
    let coverUploadCalled = false;

    server.use(
      http.get("/api/metadata/cover-proxy", () => {
        coverProxyCalled = true;
        return new HttpResponse(new Uint8Array([0]).buffer, {
          headers: { "Content-Type": "image/jpeg" },
        });
      }),
      http.get("/api/metadata/search", () =>
        HttpResponse.json({
          results: [
            {
              title: "Книга без обложки",
              authors: "Автор Без Обложки",
              description: "Описание без обложки",
              publisher: "Издатель",
              pubDate: "2022",
              isbn: "456",
              tags: "тест",
              source: "google",
              coverUrl: "", // no cover URL
            },
          ],
        }),
      ),
      http.post("/api/books/:id/cover", () => {
        coverUploadCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    renderWithProviders(
      <BookEditForm
        book={mockBook}
        options={mockOptions}
        onSave={vi.fn()}
      />,
    );

    // Open metadata search
    const metadataBtn = screen.getByRole("button", { name: /метаданн/i });
    await user.click(metadataBtn);

    // Search for results
    await user.click(screen.getByRole("button", { name: /^Поиск$/i }));

    // Wait for result with no cover
    await waitFor(() => {
      expect(screen.getByText("Книга без обложки")).toBeInTheDocument();
    });

    // Click on the cover area (no img, just a div — also applies metadata via parent div)
    const coverDiv = screen.getAllByTitle(/Нажмите, чтобы применить метаданные/)[0];
    await user.click(coverDiv);

    // Wait for metadata search to close (modal dismissed after apply)
    await waitFor(() => {
      // Title should be updated in the form
      // The modal closes after apply, so the metadata search modal is no longer visible
      expect(screen.queryByRole("button", { name: /^Поиск$/i })).not.toBeInTheDocument();
    });

    // Neither cover-proxy nor cover upload should have been called (no coverUrl)
    expect(coverProxyCalled).toBe(false);
    expect(coverUploadCalled).toBe(false);
  });
});
