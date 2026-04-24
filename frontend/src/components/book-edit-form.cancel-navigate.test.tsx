// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import BookEditForm from "./book-edit-form";
import type { Book } from "../types";
import type { BookEditOptions } from "./book-edit-form.types";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

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

describe("book-edit-form — cancel navigate", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("cancel_uploads_delete_failure_still_navigates", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({ tempId: "t1", format: "FB2", metadata: {}, duplicate: null }),
      ),
      http.delete("/api/uploads/:tempId", () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );
    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const bookFileInput = Array.from(fileInputs).find((i) => !i.accept.includes("image"));
    expect(bookFileInput).not.toBeNull();
    await user.upload(bookFileInput!, new File([new Uint8Array([0])], "book.fb2"));
    await waitFor(() => {
      expect(screen.queryAllByText(/^FB2\s*—/).length).toBeGreaterThan(0);
    });

    const cancelBtn = screen.getByRole("button", { name: /^отмена$/i });
    await user.click(cancelBtn);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });
});
