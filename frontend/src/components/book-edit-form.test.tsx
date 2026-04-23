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
    expect(screen.getByDisplayValue("Автор Без Обложки")).toBeInTheDocument();

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

  it("upload reject 400: POST /api/books/:id/cover returns 400 → window.alert called", async () => {
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

  it("commit: after cover upload, clicking Save triggers PUT /api/books/:id/cover", async () => {
    const user = userEvent.setup();
    let putCalled = false;
    const onSave = vi.fn().mockResolvedValue(undefined);

    server.use(
      http.post("/api/books/:id/cover", () =>
        HttpResponse.json({ ok: true, tempCoverUrl: "/api/uploads/cover/42" }),
      ),
      http.put("/api/books/:id/cover", () => {
        putCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={onSave} />,
    );

    await uploadCoverFile(user);

    await waitFor(() => {
      const img = screen.queryByRole("img", { name: /тестовая книга/i });
      expect((img as HTMLImageElement | null)?.src).toContain("/api/uploads/cover/42");
    });

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

  it("files upload happy: drop/select file → POST /api/books/:id/files → format appears in list", async () => {
    const user = userEvent.setup();
    let uploadCalled = false;

    server.use(
      http.post("/api/books/:id/files", () => {
        uploadCalled = true;
        return HttpResponse.json({ format: "fb2", size: 204800 });
      }),
    );

    renderWithProviders(
      <BookEditForm book={mockBook} options={mockOptions} onSave={vi.fn()} />,
    );

    // Select a file via the hidden file input (non-image, non-cover input)
    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const bookFileInput = Array.from(fileInputs).find((i) => !i.accept.includes("image"));
    expect(bookFileInput).not.toBeNull();

    const fakeFile = new File([new Uint8Array([0, 1, 2, 3])], "book.fb2", {
      type: "application/octet-stream",
    });
    await user.upload(bookFileInput!, fakeFile);

    await waitFor(() => {
      expect(uploadCalled).toBe(true);
    });

    await waitFor(() => {
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
      }),
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
      <BookEditForm book={bookWithTwoFormats} options={mockOptions} onSave={vi.fn()} />,
    );

    const bodyText = document.body.textContent || "";
    expect(bodyText).toMatch(/epub/);
    expect(bodyText).toMatch(/fb2/);

    const allButtons = screen.getAllByRole("button");
    const deleteFormatBtns = allButtons.filter((b) => b.textContent?.includes("Удалить"));
    expect(deleteFormatBtns.length).toBeGreaterThan(0);

    await user.click(deleteFormatBtns[0]);

    await waitFor(() => {
      const bodyContent = document.body.textContent || "";
      expect(bodyContent).toMatch(/Удалить файл epub/);
    });

    const confirmBtnInDialog = screen.getByTestId("confirm-dialog-submit");
    await user.click(confirmBtnInDialog);

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });

    expect(deletedFormat).toBe("epub");

    await waitFor(() => {
      const remaining = document.body.textContent || "";
      expect(remaining).toMatch(/fb2/);
    });
  });
});
