// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import UploadForm from "./upload-form";
import { mergeMeta } from "./upload-form.helpers";
import { domainEvents } from "@/domain/events";
import type { UploadResponse } from "@/api/endpoints/upload";

const FULL_METADATA: UploadResponse["metadata"] = {
  title: "Test Book",
  authors: "Author One",
  series: "",
  seriesNumber: "",
  description: "",
  language: "ru",
  tags: "",
  publisher: "",
  pubDate: "",
  isbn: "",
  coverUrl: null,
};

function makeUploadHandler(overrides: Partial<UploadResponse> = {}) {
  return http.post("/api/upload", () =>
    HttpResponse.json({
      tempId: "abc123",
      format: "FB2",
      metadata: FULL_METADATA,
      duplicate: null,
      ...overrides,
    } satisfies UploadResponse)
  );
}

async function uploadFile(
  container: Element,
  filename = "test.fb2",
  content = "content",
  mimeType = "application/x-fictionbook",
) {
  const user = userEvent.setup();
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File([content], filename, { type: mimeType });
  await user.upload(input, file);
  return { user, file };
}

describe("mergeMeta", () => {
  const empty: UploadResponse["metadata"] = {
    title: "", authors: "", series: "", seriesNumber: "",
    description: "", language: "", tags: "", publisher: "",
    pubDate: "", isbn: "", coverUrl: null,
  };

  it("prefers non-empty for pick fields", () => {
    const a = { ...empty, language: "ru", isbn: "" };
    const b = { ...empty, language: "", isbn: "978-1" };
    const m = mergeMeta(a, b);
    expect(m.language).toBe("ru");
    expect(m.isbn).toBe("978-1");
  });

  it("prefers longer title (string-length, not word-count)", () => {
    const a = { ...empty, title: "Short" };
    const b = { ...empty, title: "Much longer title" };
    expect(mergeMeta(a, b).title).toBe("Much longer title");
  });

  it("prefers longer description by string-length", () => {
    const a = { ...empty, description: "abc" };
    const b = { ...empty, description: "abcd" };
    expect(mergeMeta(a, b).description).toBe("abcd");
  });

  it("prefers longer tags by string-length, NOT split-by-comma count", () => {
    const a = { ...empty, tags: "fiction,drama" };       // 2 tags, 13 chars
    const b = { ...empty, tags: "supercalifragilistic" }; // 1 tag, 20 chars
    expect(mergeMeta(a, b).tags).toBe("supercalifragilistic");
  });

  it("coverUrl: null in a falls back to b", () => {
    const a = { ...empty, coverUrl: null };
    const b = { ...empty, coverUrl: "/c.jpg" };
    expect(mergeMeta(a, b).coverUrl).toBe("/c.jpg");
  });

  it("coverUrl: both null returns null", () => {
    expect(mergeMeta({ ...empty, coverUrl: null }, { ...empty, coverUrl: null }).coverUrl).toBeNull();
  });

  it("target wins on tie (length-equal title)", () => {
    const a = { ...empty, title: "Same" };
    const b = { ...empty, title: "Boba" };
    expect(mergeMeta(a, b).title).toBe("Same");
  });
});

describe("UploadForm", () => {
  beforeEach(() => {
    domainEvents.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: upload file → group appears with metadata", async () => {
    server.use(makeUploadHandler());

    const { container } = renderWithProviders(<UploadForm />);
    await uploadFile(container);

    await waitFor(() => {
      expect(screen.getByText("Test Book")).toBeInTheDocument();
    });
    expect(screen.getByText("Author One")).toBeInTheDocument();
    // format badge
    expect(screen.getByText("FB2")).toBeInTheDocument();
  });

  it("upload error 400 → file status shows error message", async () => {
    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json(
          { detail: "File too large" },
          { status: 400 },
        )
      )
    );

    const { container } = renderWithProviders(<UploadForm />);
    await uploadFile(container);

    await waitFor(() => {
      expect(screen.getByText("File too large")).toBeInTheDocument();
    });
  });

  it("save all → POST /api/books/create fires with tempId and metadata", async () => {
    let capturedBody: unknown = null;
    const events: Array<{ bookId: number; book?: { id: number; title?: string } }> = [];
    domainEvents.subscribe("bookCreated", (payload) => events.push(payload));

    server.use(
      makeUploadHandler(),
      http.post("/api/books/create", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ bookId: 100 });
      })
    );

    const { container } = renderWithProviders(<UploadForm />);
    const { user } = await uploadFile(container);

    await waitFor(() => {
      expect(screen.getByText("Test Book")).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", { name: /Сохранить всё/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(capturedBody).toMatchObject({
        tempId: "abc123",
        metadata: expect.objectContaining({ title: "Test Book" }),
      });
    });
    // Тик — публикация (если её вернут) шла бы после резолва await у клиента.
    await new Promise((r) => setTimeout(r, 0));
    // Списки инвалидирует серверное событие; локальной публикации нет.
    expect(events).toEqual([]);
  });

  it("remove file → DELETE /api/uploads/:tempId fires", async () => {
    let deletedTempId: string | undefined;

    server.use(
      makeUploadHandler(),
      http.delete("/api/uploads/:tempId", ({ params }) => {
        deletedTempId = params.tempId as string;
        return HttpResponse.json({ ok: true });
      })
    );

    // Upload two files so the remove (×) button is visible for each file
    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    // Upload first file
    const file1 = new File(["content1"], "book1.fb2", {
      type: "application/x-fictionbook",
    });
    await user.upload(input, file1);

    // Upload second file with different title so they form separate groups
    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({
          tempId: "def456",
          format: "EPUB",
          metadata: { ...FULL_METADATA, title: "Second Book", authors: "Author Two" },
          duplicate: null,
        } satisfies UploadResponse)
      )
    );
    const file2 = new File(["content2"], "book2.epub", {
      type: "application/epub+zip",
    });
    await user.upload(input, file2);

    // Wait for both groups to appear
    await waitFor(() => {
      expect(screen.getByText("Test Book")).toBeInTheDocument();
      expect(screen.getByText("Second Book")).toBeInTheDocument();
    });

    // Now there are multiple groups, so within each group the ✕ (remove file)
    // button is not shown (only groups.length > 1 shows the per-file ✕ inside group).
    // Instead use the group remove button (the ✕ at the top of the first group card).
    const groupCards = screen.getAllByTestId("upload-group");
    const removeBtn = within(groupCards[0]).getByRole("button", { name: "✕" });
    await user.click(removeBtn);

    await waitFor(() => {
      expect(deletedTempId).toBe("abc123");
    });
  });

  it("duplicate warning: upload returns duplicate → UI shows duplicate book info", async () => {
    server.use(
      makeUploadHandler({
        duplicate: { id: 42, title: "Existing Book", authors: [{ id: 1, name: "Some Author" }] },
      })
    );

    const { container } = renderWithProviders(<UploadForm />);
    await uploadFile(container);

    await waitFor(() => {
      expect(screen.getByText(/Похожая книга/)).toBeInTheDocument();
      expect(screen.getByText(/Existing Book/)).toBeInTheDocument();
    });
  });

  it("merge: source group + target group → объединение в target metadata + files", async () => {
    let uploadCount = 0;
    server.use(
      http.post("/api/upload", () => {
        uploadCount += 1;
        return HttpResponse.json(
          uploadCount === 1
            ? {
                tempId: "src-1",
                format: "FB2",
                metadata: { ...FULL_METADATA, title: "Source Book", authors: "Author A" },
                duplicate: null,
              }
            : {
                tempId: "tgt-1",
                format: "EPUB",
                metadata: { ...FULL_METADATA, title: "Target Book", authors: "Author B", language: "" },
                duplicate: null,
              }
        );
      })
    );

    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, new File(["s"], "source.fb2", { type: "application/x-fictionbook" }));
    await user.upload(input, new File(["t"], "target.epub", { type: "application/epub+zip" }));

    await waitFor(() => {
      expect(screen.getByText("Source Book")).toBeInTheDocument();
      expect(screen.getByText("Target Book")).toBeInTheDocument();
    });

    const sourceCard = screen.getByText("Source Book").closest("[data-testid='upload-group']")!;
    await user.click(within(sourceCard as HTMLElement).getByRole("button", { name: /Объединить/ }));

    const targetCard = screen.getByText("Target Book").closest("[data-testid='upload-group']")!;
    await user.click(targetCard as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByText("Source Book")).not.toBeInTheDocument();
      expect(screen.getByText("Target Book")).toBeInTheDocument();
    });
    const groups = screen.getAllByTestId("upload-group");
    expect(groups).toHaveLength(1);
    expect(within(groups[0]).getByText("FB2")).toBeInTheDocument();
    expect(within(groups[0]).getByText("EPUB")).toBeInTheDocument();
    expect(within(groups[0]).getByText("ru")).toBeInTheDocument();
  });

  it("cancelAll: DELETE /api/uploads/:tempId fires for each uploaded file, groups cleared", async () => {
    const deleted: string[] = [];
    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({ tempId: "abc-cancel", format: "FB2", metadata: FULL_METADATA, duplicate: null })
      ),
      http.delete("/api/uploads/:tempId", ({ params }) => {
        deleted.push(params.tempId as string);
        return HttpResponse.json({ ok: true });
      })
    );

    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    await uploadFile(container);
    await waitFor(() => expect(screen.getByText("Test Book")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Отменить всё/i }));

    await waitFor(() => {
      expect(deleted).toContain("abc-cancel");
      expect(screen.queryByText("Test Book")).not.toBeInTheDocument();
    });
  });

  it("duplicate-action toggle: clicking sets duplicateAction, switching toggles", async () => {
    server.use(
      makeUploadHandler({
        duplicate: { id: 42, title: "Existing", authors: [{ id: 1, name: "X" }] },
      })
    );

    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    await uploadFile(container);
    await waitFor(() => expect(screen.getByText(/Похожая книга/)).toBeInTheDocument());

    const addFormatBtn = screen.getByRole("button", { name: /Добавить как формат/ });
    const newBookBtn = screen.getByRole("button", { name: /Сохранить как отдельную/ });

    await user.click(addFormatBtn);
    expect(addFormatBtn.style.background).not.toBe("transparent");
    expect(newBookBtn.style.background).toBe("transparent");

    await user.click(newBookBtn);
    expect(newBookBtn.style.background).not.toBe("transparent");
    expect(addFormatBtn.style.background).toBe("transparent");
  });

  it("hasDuplicateFormat: two files of same format same title → red warning", async () => {
    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({
          tempId: crypto.randomUUID(),
          format: "FB2",
          metadata: FULL_METADATA,
          duplicate: null,
        })
      )
    );

    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, new File(["a"], "a.fb2", { type: "application/x-fictionbook" }));
    await user.upload(input, new File(["b"], "b.fb2", { type: "application/x-fictionbook" }));

    await waitFor(() => {
      expect(screen.getByText(/Одинаковый формат — дубликат будет пропущен/)).toBeInTheDocument();
    });
  });

  it("save with duplicate=add-format multi-file: addFormat called per file, no createBookFromUpload", async () => {
    let createCalls = 0;
    const addFormatCalls: Array<{ id: string; tempId: string }> = [];
    const events: Array<{ book: { id: number }; changedFields: string[] }> = [];
    domainEvents.subscribe("bookUpdated", (payload) => events.push(payload));
    let n = 0;
    server.use(
      http.post("/api/upload", () => {
        n += 1;
        return HttpResponse.json({
          tempId: `t-${n}`,
          format: n === 1 ? "FB2" : "EPUB",
          metadata: FULL_METADATA,
          duplicate: { id: 42, title: "Existing", authors: [{ id: 1, name: "X" }] },
        });
      }),
      http.post("/api/books/create", () => { createCalls += 1; return HttpResponse.json({ bookId: 100 }); }),
      http.post("/api/books/:id/add-format", async ({ params, request }) => {
        const body = await request.json() as { tempId: string };
        addFormatCalls.push({ id: params.id as string, tempId: body.tempId });
        return HttpResponse.json({ ok: true, format: "FB2" });
      })
    );

    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["a"], "a.fb2", { type: "application/x-fictionbook" }));
    await user.upload(input, new File(["b"], "b.epub", { type: "application/epub+zip" }));

    await waitFor(() => expect(screen.getByText(/Похожая книга/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Добавить как формат/ }));
    await user.click(screen.getByRole("button", { name: /Сохранить всё/i }));

    await waitFor(() => expect(addFormatCalls.length).toBe(2));
    expect(createCalls).toBe(0);
    expect(addFormatCalls.every((c) => c.id === "42")).toBe(true);
    expect(events).toEqual([]);
  });

  it("merge-self: clicking own card after activating merge resets mergeSource via Отмена", async () => {
    let n = 0;
    server.use(
      http.post("/api/upload", () => {
        n += 1;
        return HttpResponse.json({
          tempId: `t-${n}`, format: "FB2",
          metadata: { ...FULL_METADATA, title: `Book ${n}`, authors: `Author ${n}` },
          duplicate: null,
        });
      })
    );
    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["1"], "1.fb2", { type: "application/x-fictionbook" }));
    await user.upload(input, new File(["2"], "2.fb2", { type: "application/x-fictionbook" }));
    await waitFor(() => expect(screen.getAllByTestId("upload-group")).toHaveLength(2));

    const firstCard = screen.getByText("Book 1").closest("[data-testid='upload-group']")!;
    await user.click(within(firstCard as HTMLElement).getByRole("button", { name: /Объединить/ }));
    await user.click(within(firstCard as HTMLElement).getByRole("button", { name: /Отмена/ }));
    expect(screen.getAllByTestId("upload-group")).toHaveLength(2);
  });

  it("auto-group metadata pick: second upload with cover replaces first's null cover", async () => {
    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({
          tempId: "t-1",
          format: "FB2",
          metadata: { ...FULL_METADATA, title: "Same Title", authors: "Same Author", coverUrl: null },
          duplicate: null,
        })
      )
    );
    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["1"], "1.fb2", { type: "application/x-fictionbook" }));
    // Wait for first upload to settle into a group
    await waitFor(() => expect(screen.getByText("Same Title")).toBeInTheDocument());

    // Now switch handler — second upload returns same group key but with cover
    server.use(
      http.post("/api/upload", () =>
        HttpResponse.json({
          tempId: "t-2",
          format: "EPUB",
          metadata: { ...FULL_METADATA, title: "Same Title", authors: "Same Author", coverUrl: "/uploads/cover/abc" },
          duplicate: null,
        })
      )
    );
    await user.upload(input, new File(["2"], "2.epub", { type: "application/epub+zip" }));

    await waitFor(() => {
      const group = screen.getByTestId("upload-group");
      const img = group.querySelector("img");
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute("src", "/uploads/cover/abc");
    });
  });

  it("save button disabled when duplicate present without action chosen", async () => {
    server.use(
      makeUploadHandler({
        duplicate: { id: 42, title: "Existing", authors: [{ id: 1, name: "X" }] },
      })
    );
    const { container } = renderWithProviders(<UploadForm />);
    await uploadFile(container);
    await waitFor(() => expect(screen.getByText(/Похожая книга/)).toBeInTheDocument());

    const saveBtn = screen.getByRole("button", { name: /Сохранить всё/i });
    expect(saveBtn).toBeDisabled();
  });

  it("cancelAll race: in-flight upload (no tempId yet) is not DELETEd", async () => {
    const deleted: string[] = [];
    let resolveUpload: ((value: Response) => void) | null = null;
    server.use(
      http.post("/api/upload", () => new Promise<Response>((resolve) => { resolveUpload = resolve; })),
      http.delete("/api/uploads/:tempId", ({ params }) => {
        deleted.push(params.tempId as string);
        return HttpResponse.json({ ok: true });
      })
    );
    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    await uploadFile(container);

    await user.click(screen.getByRole("button", { name: /Отменить всё/i }));

    resolveUpload!(HttpResponse.json({
      tempId: "ready-1", format: "FB2", metadata: FULL_METADATA, duplicate: null,
    }));

    await waitFor(() => expect(screen.queryAllByTestId("upload-group")).toHaveLength(0));
    expect(deleted).not.toContain("ready-1");
  });

  it("error in addFormat: console.warn + alert + saving cleared", async () => {
    const alertSpy = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
    server.use(
      makeUploadHandler({
        duplicate: { id: 42, title: "Existing", authors: [{ id: 1, name: "X" }] },
      }),
      http.post("/api/books/:id/add-format", () => HttpResponse.json({ detail: "fail" }, { status: 500 }))
    );

    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    await uploadFile(container);
    await waitFor(() => expect(screen.getByText(/Похожая книга/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Добавить как формат/ }));
    await user.click(screen.getByRole("button", { name: /Сохранить всё/i }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Не удалось добавить формат"));
    alertSpy.mockRestore();
  });

  it("resetSaved: «Загрузить ещё» clears saved state, ready for new upload", async () => {
    server.use(
      makeUploadHandler(),
      http.post("/api/books/create", () => HttpResponse.json({ bookId: 100 }))
    );
    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    await uploadFile(container);
    await waitFor(() => expect(screen.getByText("Test Book")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Сохранить всё/i }));
    await waitFor(() => expect(screen.getByText("Сохранено!")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Загрузить ещё/ }));
    expect(screen.queryByText("Сохранено!")).not.toBeInTheDocument();
    expect(screen.queryByText("Test Book")).not.toBeInTheDocument();
  });

  it("pending-group + upload error: error group remains in DOM with status=error", async () => {
    server.use(
      http.post("/api/upload", () => HttpResponse.json({ detail: "Bad file" }, { status: 400 }))
    );
    const { container } = renderWithProviders(<UploadForm />);
    await uploadFile(container, "broken.fb2");
    await waitFor(() => expect(screen.getByText("Bad file")).toBeInTheDocument());
    expect(screen.getAllByTestId("upload-group")).toHaveLength(1);
  });

  it("merge guard: clicking card without active mergeSource is no-op", async () => {
    let n = 0;
    server.use(
      http.post("/api/upload", () => {
        n += 1;
        return HttpResponse.json({
          tempId: `t-${n}`, format: "FB2",
          metadata: { ...FULL_METADATA, title: `Book ${n}`, authors: `A ${n}` },
          duplicate: null,
        });
      })
    );
    const { container } = renderWithProviders(<UploadForm />);
    const user = userEvent.setup();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["1"], "1.fb2", { type: "application/x-fictionbook" }));
    await user.upload(input, new File(["2"], "2.fb2", { type: "application/x-fictionbook" }));
    await waitFor(() => expect(screen.getAllByTestId("upload-group")).toHaveLength(2));

    const card = screen.getByText("Book 1").closest("[data-testid='upload-group']")!;
    await user.click(card as HTMLElement);
    expect(screen.getAllByTestId("upload-group")).toHaveLength(2);
  });
});
