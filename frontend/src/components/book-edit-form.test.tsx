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

type UserEvent = ReturnType<typeof userEvent.setup>;

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

interface MetadataResult {
  title: string;
  authors: string;
  description: string;
  publisher: string;
  pubDate: string;
  isbn: string;
  tags: string;
  source: string;
  coverUrl: string;
}

function buildMetadataResult(overrides: Partial<MetadataResult> = {}): MetadataResult {
  return {
    title: "Новая книга",
    authors: "Новый Автор",
    description: "Описание",
    publisher: "Издатель",
    pubDate: "2023",
    isbn: "123",
    tags: "тест",
    source: "litres",
    coverUrl: "https://example.com/cover.jpg",
    ...overrides,
  };
}

function mockMetadataSearch(result: MetadataResult) {
  return http.get("/api/metadata/search", () =>
    HttpResponse.json({ results: [result] }),
  );
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);

function mockCoverProxyOk() {
  return http.get("/api/metadata/cover-proxy", () =>
    new HttpResponse(PNG_BYTES.buffer, { headers: { "Content-Type": "image/jpeg" } }),
  );
}

async function openMetadataSearchAndApplyResult(user: UserEvent, resultTitle: string) {
  const metadataBtn = screen.getByRole("button", { name: /метаданн/i });
  await user.click(metadataBtn);
  await user.click(screen.getByRole("button", { name: /^Поиск$/i }));
  await waitFor(() => {
    expect(screen.getByText(resultTitle)).toBeInTheDocument();
  });
  const coverDiv = screen.getAllByTitle(/Нажмите, чтобы применить метаданные/)[0];
  await user.click(coverDiv);
}

async function uploadCoverFile(user: UserEvent) {
  const coverInput = document.querySelector<HTMLInputElement>(
    'input[type="file"][accept="image/*"]',
  );
  expect(coverInput).not.toBeNull();
  const fakeFile = new File([PNG_BYTES], "cover.jpg", { type: "image/jpeg" });
  await user.upload(coverInput!, fakeFile);
}

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
      http.get("/api/metadata/cover-proxy", () => {
        coverProxyCalled = true;
        return new HttpResponse(PNG_BYTES.buffer, {
          headers: { "Content-Type": "image/jpeg" },
        });
      }),
      mockMetadataSearch(buildMetadataResult()),
      http.post("/api/books/:id/cover", () => {
        coverUploadCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    await openMetadataSearchAndApplyResult(user, "Новая книга");

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
      mockCoverProxyOk(),
      mockMetadataSearch(
        buildMetadataResult({
          title: "Книга с обложкой",
          authors: "Автор Один",
          pubDate: "2024",
          isbn: "789",
          coverUrl: "https://example.com/new-cover.jpg",
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

    await openMetadataSearchAndApplyResult(user, "Книга с обложкой");

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

  it("applyMetadata with coverUrl: cover-proxy returns 500 → alert called (h53)", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();

    server.use(
      http.get("/api/metadata/cover-proxy", () =>
        HttpResponse.json({ detail: "proxy error" }, { status: 500 }),
      ),
      mockMetadataSearch(
        buildMetadataResult({
          title: "Книга с ошибкой обложки",
          authors: "Автор Ошибка",
          pubDate: "2024",
          isbn: "000",
          coverUrl: "https://example.com/bad-cover.jpg",
        }),
      ),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    await openMetadataSearchAndApplyResult(user, "Книга с ошибкой обложки");

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Не удалось загрузить обложку из метаданных");
    });

    alertSpy.mockRestore();
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
      mockMetadataSearch(
        buildMetadataResult({
          title: "Книга без обложки",
          authors: "Автор Без Обложки",
          description: "Описание без обложки",
          pubDate: "2022",
          isbn: "456",
          source: "google",
          coverUrl: "",
        }),
      ),
      http.post("/api/books/:id/cover", () => {
        coverUploadCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    await openMetadataSearchAndApplyResult(user, "Книга без обложки");

    await waitFor(() => {
      // The modal closes after apply
      expect(screen.queryByRole("button", { name: /^Поиск$/i })).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Книга без обложки")).toBeInTheDocument();
    });
    expect(screen.getByTestId("book-edit-token-field-authors")).toHaveTextContent("Автор Без Обложки");

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

    await uploadCoverFile(user);

    await waitFor(() => {
      expect(uploadCalled).toBe(true);
    });

    await waitFor(() => {
      const img = screen.queryByRole("img", { name: /тестовая книга/i });
      expect(img).not.toBeNull();
      expect((img as HTMLImageElement).src).toContain("/api/uploads/cover/42");
    });
  });

  it("upload reject 400: POST /api/books/:id/cover returns 400 → globalThis.alert called", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();

    server.use(
      http.post("/api/books/:id/cover", () =>
        HttpResponse.json({ detail: "too big" }, { status: 400 }),
      ),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    await uploadCoverFile(user);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("too big");
    });

    alertSpy.mockRestore();
  });

  it("discard: after cover upload, clicking Cancel triggers DELETE /api/books/:id/cover", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;

    server.use(
      http.post("/api/books/:id/cover", () =>
        HttpResponse.json({ ok: true, tempCoverUrl: "/api/uploads/cover/42" }),
      ),
      http.delete("/api/books/:id/cover", () => {
        deleteCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    await uploadCoverFile(user);

    await waitFor(() => {
      const img = screen.queryByRole("img", { name: /тестовая книга/i });
      expect((img as HTMLImageElement | null)?.src).toContain("/api/uploads/cover/42");
    });

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

  it("pending_add_appears_in_list", async () => {
    const user = userEvent.setup();
    let uploadCalled = false;

    server.use(
      http.post("/api/upload", () => {
        uploadCalled = true;
        return HttpResponse.json({ tempId: "abc123", format: "FB2", metadata: {}, duplicate: null });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const bookFileInput = Array.from(fileInputs).find((i) => !i.accept.includes("image"));
    expect(bookFileInput).not.toBeNull();
    await user.upload(bookFileInput!, new File([new Uint8Array([0, 1, 2, 3])], "book.fb2", { type: "application/octet-stream" }));

    await waitFor(() => expect(uploadCalled).toBe(true));
    await waitFor(() => {
      expect(screen.queryAllByText(/^FB2\s*—/).length).toBeGreaterThan(0);
    });
  });

  it("remove_pending_add_calls_uploads_delete", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;

    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({ tempId: "abc123", format: "FB2", metadata: {}, duplicate: null }),
      ),
      http.delete("/api/uploads/abc123", () => {
        deleteCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    const twoFormats = { ...mockBook, formats: [{ format: "epub", size: "1 MB" }, { format: "pdf", size: "2 MB" }] };
    renderWithProviders(
      <BookEditForm book={twoFormats} options={mockOptions} onSave={vi.fn()} />,
    );

    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const bookFileInput = Array.from(fileInputs).find((i) => !i.accept.includes("image"));
    expect(bookFileInput).not.toBeNull();
    await user.upload(bookFileInput!, new File([new Uint8Array([0])], "book.fb2"));

    await waitFor(() => {
      expect(screen.queryAllByText(/^FB2\s*—/).length).toBeGreaterThan(0);
    });

    const delBtns = screen.getAllByRole("button").filter(b => b.textContent?.toLowerCase().includes("удалить"));
    await user.click(delBtns[delBtns.length - 1]);
    const confirmBtn = screen.queryByTestId("confirm-dialog-submit");
    if (confirmBtn) await user.click(confirmBtn);

    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  it("click_delete_existing_format_no_api_call", async () => {
    const user = userEvent.setup();
    let filesDeleteCalled = false;

    server.use(
      http.delete("/api/books/:id/files", () => {
        filesDeleteCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    const twoFormats = { ...mockBook, formats: [{ format: "epub", size: "1 MB" }, { format: "fb2", size: "500 KB" }] };
    renderWithProviders(
      <BookEditForm book={twoFormats} options={mockOptions} onSave={vi.fn()} />,
    );

    // Sanity: оба формата видны в списке формат-items (не dropzone-подсказка).
    expect(screen.queryAllByText(/^epub\s*—/i).length).toBeGreaterThan(0);

    const delBtns = screen.getAllByRole("button").filter(b => b.textContent?.toLowerCase().includes("удалить"));
    expect(delBtns.length).toBeGreaterThan(0);
    await user.click(delBtns[0]);
    const confirmBtn = screen.queryByTestId("confirm-dialog-submit");
    if (confirmBtn) await user.click(confirmBtn);

    await new Promise(r => setTimeout(r, 50));
    expect(filesDeleteCalled).toBe(false);
    await waitFor(() => {
      expect(screen.queryAllByText(/^epub\s*—/i)).toHaveLength(0);
    });
  });

  it("save_sends_single_put_with_all_changes", async () => {
    const user = userEvent.setup();
    let capturedPayload: import("./book-edit-form.types").BookSavePayload | null = null;
    const parentOnSave = async (payload: import("./book-edit-form.types").BookSavePayload) => {
      capturedPayload = payload;
    };

    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({ tempId: "t1", format: "FB2", metadata: {}, duplicate: null }),
      ),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={parentOnSave} />,
    );

    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const bookFileInput = Array.from(fileInputs).find((i) => !i.accept.includes("image"));
    expect(bookFileInput).not.toBeNull();
    await user.upload(bookFileInput!, new File([new Uint8Array([0])], "book.fb2"));
    await waitFor(() => {
      expect(screen.queryAllByText(/^FB2\s*—/).length).toBeGreaterThan(0);
    });

    const saveBtn = screen.getByRole("button", { name: /сохранить/i });
    await user.click(saveBtn);

    await waitFor(() => expect(capturedPayload).not.toBeNull());
    expect(capturedPayload!.addFormats).toEqual(["t1"]);
    expect(capturedPayload!.deleteFormats).toEqual([]);
    expect(capturedPayload!.commitCover).toBe(false);
  });

  it("save_no_changes_still_sends_put", async () => {
    const user = userEvent.setup();
    let capturedPayload: import("./book-edit-form.types").BookSavePayload | null = null;
    const parentOnSave = async (payload: import("./book-edit-form.types").BookSavePayload) => {
      capturedPayload = payload;
    };

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={parentOnSave} />,
    );

    const saveBtn = screen.getByRole("button", { name: /сохранить/i });
    await user.click(saveBtn);

    await waitFor(() => expect(capturedPayload).not.toBeNull());
    expect(capturedPayload!.addFormats).toEqual([]);
    expect(capturedPayload!.deleteFormats).toEqual([]);
    expect(capturedPayload!.commitCover).toBe(false);
  });

  it("edits authors with the same token UI as tags and saves authors as CSV", async () => {
    const user = userEvent.setup();
    let capturedPayload: import("./book-edit-form.types").BookSavePayload | null = null;
    const parentOnSave = async (payload: import("./book-edit-form.types").BookSavePayload) => {
      capturedPayload = payload;
    };
    const options: BookEditOptions = {
      ...mockOptions,
      authors: [
        { id: 1, name: "Автор Тестов" },
        { id: 2, name: "Новый Автор" },
      ],
    };

    renderWithProviders(
      <BookEditForm book={mockBook} options={options} onSave={parentOnSave} />,
    );

    const authorField = screen.getByTestId("book-edit-token-field-authors");
    expect(authorField).toHaveTextContent("Автор Тестов");

    await user.click(screen.getByRole("button", { name: "Удалить Автор Тестов" }));
    expect(authorField).not.toHaveTextContent("Автор Тестов");

    await user.type(screen.getByPlaceholderText("Найти или добавить автора..."), "Новый");
    await user.click(screen.getByText("Новый Автор"));
    expect(authorField).toHaveTextContent("Новый Автор");

    await user.click(screen.getByRole("button", { name: /сохранить/i }));

    await waitFor(() => expect(capturedPayload).not.toBeNull());
    expect(capturedPayload!.authors).toBe("Новый Автор");
  });

  it("save_4xx_shows_detail_preserves_state", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();

    const parentOnSave = vi.fn(async () => {
      const { ConflictError } = await import("@/api/errors");
      throw new ConflictError(409, "Формат EPUB уже есть");
    });

    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({ tempId: "t1", format: "FB2", metadata: {}, duplicate: null }),
      ),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={parentOnSave} />,
    );

    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const bookFileInput = Array.from(fileInputs).find((i) => !i.accept.includes("image"));
    expect(bookFileInput).not.toBeNull();
    await user.upload(bookFileInput!, new File([new Uint8Array([0])], "book.fb2"));
    await waitFor(() => {
      expect(screen.queryAllByText(/^FB2\s*—/).length).toBeGreaterThan(0);
    });

    const saveBtn = screen.getByRole("button", { name: /сохранить/i });
    await user.click(saveBtn);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Формат EPUB уже есть"));
    alertSpy.mockRestore();
  });

  it("save_5xx_shows_generic_preserves_state", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();
    const parentOnSave = vi.fn(async () => {
      const { ServerError } = await import("@/api/errors");
      throw new ServerError(500, "Internal Server Error");
    });

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={parentOnSave} />,
    );
    const saveBtn = screen.getByRole("button", { name: /сохранить/i });
    await user.click(saveBtn);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Не удалось сохранить изменения"));
    alertSpy.mockRestore();
  });

  it("cancel_cleans_up_pending_adds", async () => {
    const user = userEvent.setup();
    const deletedIds: string[] = [];

    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({ tempId: `t_${Date.now()}_${Math.random()}`, format: "FB2", metadata: {}, duplicate: null }),
      ),
      http.delete("/api/uploads/:tempId", ({ params }) => {
        deletedIds.push(params.tempId as string);
        return HttpResponse.json({ ok: true });
      }),
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

    await waitFor(() => expect(deletedIds.length).toBeGreaterThanOrEqual(1));
  });

  it("cancel_no_pending_no_requests", async () => {
    const user = userEvent.setup();
    let anyRequest = false;

    server.use(
      http.delete("/api/uploads/:tempId", () => { anyRequest = true; return HttpResponse.json({ ok: true }); }),
      http.delete("/api/books/:id/cover", () => { anyRequest = true; return HttpResponse.json({ ok: true }); }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );
    const cancelBtn = screen.getByRole("button", { name: /^отмена$/i });
    await user.click(cancelBtn);

    await new Promise(r => setTimeout(r, 50));
    expect(anyRequest).toBe(false);
  });

  it("upload_duplicate_format_alerts_and_reverts", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();
    let deleteTempCalled = false;

    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({ tempId: "dup1", format: "EPUB", metadata: {}, duplicate: null }),
      ),
      http.delete("/api/uploads/dup1", () => {
        deleteTempCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    // mockBook.formats содержит EPUB.
    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const bookFileInput = Array.from(fileInputs).find((i) => !i.accept.includes("image"));
    expect(bookFileInput).not.toBeNull();
    await user.upload(bookFileInput!, new File([new Uint8Array([0])], "another.epub"));

    // Bug 2 guard сработал: alert + deleteTempUpload + НЕ добавлено в список.
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("EPUB"));
    });
    await waitFor(() => expect(deleteTempCalled).toBe(true));

    // В списке только одна запись EPUB (оригинал; не удвоилась).
    expect(screen.queryAllByText(/^EPUB\s*—/i).length).toBe(1);

    alertSpy.mockRestore();
  });

  it("upload_replace_after_pending_delete_allowed", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({ tempId: "rep1", format: "EPUB", metadata: {}, duplicate: null }),
      ),
    );

    // Используем книгу с двумя форматами — кнопка удаления рендерится только если formats.length > 1.
    const twoFormats = { ...mockBook, formats: [{ format: "epub", size: "1 MB" }, { format: "pdf", size: "2 MB" }] };
    renderWithProviders(
      <BookEditForm book={twoFormats} options={mockOptions} onSave={vi.fn()} />,
    );

    // Шаг 1: пометить оригинальный EPUB на удаление.
    const delBtns = screen.getAllByRole("button").filter(b => b.textContent?.toLowerCase().includes("удалить"));
    expect(delBtns.length).toBeGreaterThan(0);
    await user.click(delBtns[0]);
    const confirmBtn = screen.queryByTestId("confirm-dialog-submit");
    if (confirmBtn) await user.click(confirmBtn);

    // Сейчас EPUB удалён из formats (помечен в pendingDelete или отфильтрован).
    await waitFor(() => {
      expect(screen.queryAllByText(/^epub\s*—/i).length).toBe(0);
    });

    // Шаг 2: загрузить новый EPUB. Guard НЕ должен сработать (replace-flow).
    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const bookFileInput = Array.from(fileInputs).find((i) => !i.accept.includes("image"));
    expect(bookFileInput).not.toBeNull();
    await user.upload(bookFileInput!, new File([new Uint8Array([0])], "new.epub"));

    // Новый EPUB добавлен без alert (replace-flow разрешён).
    await waitFor(() => {
      expect(screen.queryAllByText(/^EPUB\s*—/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});
