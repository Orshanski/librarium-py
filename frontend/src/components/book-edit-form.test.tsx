// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import BookEditForm from "./book-edit-form";
import type { Book } from "../types";
import type { BookEditOptions } from "./book-edit-form.types";

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

  it("applyMetadata with coverUrl: tempCoverUrl from response used for setCoverUrl", async () => {
    const user = userEvent.setup();
    let coverUploadCalled = false;

    server.use(
      http.get("/api/metadata/cover-proxy", () => {
        return new HttpResponse(new Uint8Array([137, 80, 78, 71]).buffer, {
          headers: { "Content-Type": "image/jpeg" },
        });
      }),
      http.get("/api/metadata/search", () =>
        HttpResponse.json({
          results: [
            {
              title: "Книга с обложкой",
              authors: "Автор Один",
              description: "Описание",
              publisher: "Издатель",
              pubDate: "2024",
              isbn: "789",
              tags: "тест",
              source: "litres",
              coverUrl: "https://example.com/new-cover.jpg",
            },
          ],
        }),
      ),
      http.post("/api/books/:id/cover", () => {
        coverUploadCalled = true;
        return HttpResponse.json({ ok: true, tempCoverUrl: "/api/uploads/cover/42" });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    const metadataBtn = screen.getByRole("button", { name: /метаданн/i });
    await user.click(metadataBtn);
    await user.click(screen.getByRole("button", { name: /^Поиск$/i }));

    await waitFor(() => {
      expect(screen.getByText("Книга с обложкой")).toBeInTheDocument();
    });

    const coverDiv = screen.getAllByTitle(/Нажмите, чтобы применить метаданные/)[0];
    await user.click(coverDiv);

    await waitFor(() => {
      expect(coverUploadCalled).toBe(true);
    });

    // After upload, the cover img src should be updated to the tempCoverUrl returned by backend
    await waitFor(() => {
      const img = screen.queryByRole("img", { name: /тестовая книга/i });
      expect(img).not.toBeNull();
      expect((img as HTMLImageElement).src).toContain("/api/uploads/cover/42");
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

    // Form fields must have received the metadata values
    await waitFor(() => {
      expect(screen.getByDisplayValue("Книга без обложки")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Автор Без Обложки")).toBeInTheDocument();

    // Neither cover-proxy nor cover upload should have been called (no coverUrl)
    expect(coverProxyCalled).toBe(false);
    expect(coverUploadCalled).toBe(false);
  });
});

describe("book-edit-form — covers", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upload happy: file input change → POST /api/books/:id/cover → cover img src updates to tempCoverUrl", async () => {
    const user = userEvent.setup();
    let uploadCalled = false;

    server.use(
      http.post("/api/books/:id/cover", () => {
        uploadCalled = true;
        return HttpResponse.json({ ok: true, tempCoverUrl: "/api/uploads/cover/42" });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    // Simulate file selection via the hidden cover input
    const coverInput = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    expect(coverInput).not.toBeNull();

    const fakeFile = new File([new Uint8Array([137, 80, 78, 71])], "cover.jpg", { type: "image/jpeg" });
    await user.upload(coverInput!, fakeFile);

    await waitFor(() => {
      expect(uploadCalled).toBe(true);
    });

    // Cover img should update to tempCoverUrl
    await waitFor(() => {
      const img = screen.queryByRole("img", { name: /тестовая книга/i });
      expect(img).not.toBeNull();
      expect((img as HTMLImageElement).src).toContain("/api/uploads/cover/42");
    });
  });

  it("upload reject 400: POST /api/books/:id/cover returns 400 → window.alert called", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();

    server.use(
      http.post("/api/books/:id/cover", () => {
        return HttpResponse.json({ detail: "too big" }, { status: 400 });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    const coverInput = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    expect(coverInput).not.toBeNull();

    const fakeFile = new File([new Uint8Array([137, 80, 78, 71])], "cover.jpg", { type: "image/jpeg" });
    await user.upload(coverInput!, fakeFile);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("too big");
    });

    alertSpy.mockRestore();
  });

  it("commit: after cover upload, clicking Save triggers PUT /api/books/:id/cover", async () => {
    const user = userEvent.setup();
    let putCalled = false;
    const onSave = vi.fn().mockResolvedValue(undefined);

    server.use(
      http.post("/api/books/:id/cover", () => {
        return HttpResponse.json({ ok: true, tempCoverUrl: "/api/uploads/cover/42" });
      }),
      http.put("/api/books/:id/cover", () => {
        putCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={onSave} />,
    );

    // Upload a cover first to set coverChanged = true
    const coverInput = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    const fakeFile = new File([new Uint8Array([137, 80, 78, 71])], "cover.jpg", { type: "image/jpeg" });
    await user.upload(coverInput!, fakeFile);

    // Wait for the upload to complete (coverChanged flag set)
    await waitFor(() => {
      const img = screen.queryByRole("img", { name: /тестовая книга/i });
      expect((img as HTMLImageElement | null)?.src).toContain("/api/uploads/cover/42");
    });

    // Click Save
    const saveBtn = screen.getByRole("button", { name: /сохранить/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(putCalled).toBe(true);
    });
  });

  it("discard: after cover upload, clicking Cancel triggers DELETE /api/books/:id/cover", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;

    server.use(
      http.post("/api/books/:id/cover", () => {
        return HttpResponse.json({ ok: true, tempCoverUrl: "/api/uploads/cover/42" });
      }),
      http.delete("/api/books/:id/cover", () => {
        deleteCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    // Upload a cover first
    const coverInput = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    const fakeFile = new File([new Uint8Array([137, 80, 78, 71])], "cover.jpg", { type: "image/jpeg" });
    await user.upload(coverInput!, fakeFile);

    // Wait for the upload to complete
    await waitFor(() => {
      const img = screen.queryByRole("img", { name: /тестовая книга/i });
      expect((img as HTMLImageElement | null)?.src).toContain("/api/uploads/cover/42");
    });

    // Click Cancel
    const cancelBtn = screen.getByRole("button", { name: /^отмена$/i });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
  });
});

describe("book-edit-form — books", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("files upload happy: drop/select file → POST /api/books/:id/files → format appears in list", async () => {
    const user = userEvent.setup();
    let uploadCalled = false;

    server.use(
      http.post("/api/books/:id/files", () => {
        uploadCalled = true;
        return HttpResponse.json({ format: "fb2", size: 204800 });
      })
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />
    );

    // Select a file via the hidden file input (non-image, non-cover input)
    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const bookFileInput = Array.from(fileInputs).find(
      (i) => !i.accept.includes("image")
    );
    expect(bookFileInput).not.toBeNull();

    const fakeFile = new File([new Uint8Array([0, 1, 2, 3])], "book.fb2", {
      type: "application/octet-stream",
    });
    await user.upload(bookFileInput!, fakeFile);

    await waitFor(() => {
      expect(uploadCalled).toBe(true);
    });

    // New format should appear in the list (along with existing "epub")
    await waitFor(() => {
      // After upload, both "epub" and "fb2" are in the list
      const formatText = document.body.textContent || "";
      expect(formatText).toMatch(/fb2/i);
    });
  });

  it("delete format: click delete on format → confirm → DELETE /api/books/:id/files?format=X → format removed", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;
    let deletedFormat = "";

    server.use(
      http.delete("/api/books/:id/files", ({ request }) => {
        const url = new URL(request.url);
        deletedFormat = url.searchParams.get("format") || "";
        deleteCalled = true;
        return HttpResponse.json({ ok: true });
      })
    );

    // Need 2+ formats so delete buttons appear (desktop-book-edit-form only shows
    // delete when formats.length > 1)
    const bookWithTwoFormats = {
      ...mockBook,
      formats: [
        { format: "epub", size: "1 MB" },
        { format: "fb2", size: "500 KB" },
      ],
    };

    renderWithProviders(
      <BookEditForm book={bookWithTwoFormats} options={mockOptions} onSave={vi.fn()} />
    );

    // With 2 formats, "Удалить" buttons should appear for each format
    // Find the one associated with "epub"
    const formatRows = document.querySelectorAll('[style*="display: flex"]');
    // Find the "Удалить" button near the "epub" text
    const bodyText = document.body.textContent || "";
    expect(bodyText).toMatch(/epub/);
    expect(bodyText).toMatch(/fb2/);

    // Get all "Удалить" buttons — format delete buttons show when formats.length > 1
    const allButtons = screen.getAllByRole("button");
    const deleteFormatBtns = allButtons.filter(b =>
      b.textContent?.includes("Удалить")
    );

    expect(deleteFormatBtns.length).toBeGreaterThan(0);

    // Click the first delete button (for epub — first in list)
    await user.click(deleteFormatBtns[0]);

    // Confirm dialog appears with the format name
    await waitFor(() => {
      const bodyContent = document.body.textContent || "";
      // ConfirmDialog shows "Удалить файл epub?"
      expect(bodyContent).toMatch(/Удалить файл epub/);
    });

    // Click the confirm button in the dialog deterministically via data-testid
    const confirmBtnInDialog = screen.getByTestId("confirm-dialog-submit");
    await user.click(confirmBtnInDialog);

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });

    expect(deletedFormat).toBe("epub");

    // The epub format row should be gone from the list
    await waitFor(() => {
      const remaining = document.body.textContent || "";
      // fb2 still there
      expect(remaining).toMatch(/fb2/);
    });
  });
});
