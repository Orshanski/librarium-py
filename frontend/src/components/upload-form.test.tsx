// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import UploadForm from "./upload-form";
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

describe("UploadForm", () => {
  beforeEach(() => {
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
        duplicate: { id: 42, title: "Existing Book", authors: "Some Author" },
      })
    );

    const { container } = renderWithProviders(<UploadForm />);
    await uploadFile(container);

    await waitFor(() => {
      expect(screen.getByText(/Похожая книга/)).toBeInTheDocument();
      expect(screen.getByText(/Existing Book/)).toBeInTheDocument();
    });
  });
});
