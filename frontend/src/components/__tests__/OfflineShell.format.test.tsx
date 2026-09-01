// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ResponsiveProvider } from "../../responsive";

vi.mock("../../utils/offline-storage", () => ({
  getOfflineBooks: vi.fn(),
  getProgress: vi.fn(),
}));

import { getOfflineBooks, getProgress } from "../../utils/offline-storage";
import OfflineShell from "../OfflineShell";

const mockedGetOfflineBooks = getOfflineBooks as ReturnType<typeof vi.fn>;
const mockedGetProgress = getProgress as ReturnType<typeof vi.fn>;

function offlineBook(formats: string[], bookId = 1, lastAccessedAt = 0) {
  return {
    bookId,
    title: "Книга",
    authors: [],
    series: null,
    seriesNumber: null,
    rating: null,
    isRead: false,
    coverBlob: new Blob(["c"]),
    formats: formats.map((format) => ({ format, fileBlob: new Blob(["f"]), fileSize: 1 })),
    savedAt: 0,
    lastAccessedAt,
    manuallyAdded: false,
  };
}

async function renderShellAndReadHref(): Promise<(string | null)[]> {
  render(
    <MemoryRouter>
      <ResponsiveProvider>
        <OfflineShell />
      </ResponsiveProvider>
    </MemoryRouter>,
  );
  const links = await screen.findAllByRole("link");
  return [...new Set(links.map((a) => a.getAttribute("href")))];
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:cover");
  URL.revokeObjectURL = vi.fn();
});

describe("OfflineShell — формат для чтения (ojdx)", () => {
  it("открывает формат последнего чтения, если он скачан", async () => {
    mockedGetOfflineBooks.mockResolvedValue([offlineBook(["EPUB", "FB2"])]);
    mockedGetProgress.mockResolvedValue({ bookId: 1, fraction: 0.3, lastFormat: "fb2" });

    expect(await renderShellAndReadHref()).toEqual(["/book/1/read/fb2"]);
  });

  // Зелёный и до правки; ловит неполную версию, открывающую формат позиции без проверки, что он скачан.
  it("формат последнего чтения не скачан — первый скачанный", async () => {
    mockedGetOfflineBooks.mockResolvedValue([offlineBook(["EPUB", "FB2"])]);
    mockedGetProgress.mockResolvedValue({ bookId: 1, fraction: 0.3, lastFormat: "pdf" });

    expect(await renderShellAndReadHref()).toEqual(["/book/1/read/epub"]);
  });

  // Зелёный и до правки; ловит падение на отсутствующей позиции и подмену первого формата умолчанием epub.
  it("позиции нет — первый скачанный", async () => {
    mockedGetOfflineBooks.mockResolvedValue([offlineBook(["FB2", "EPUB"])]);
    mockedGetProgress.mockResolvedValue(null);

    expect(await renderShellAndReadHref()).toEqual(["/book/1/read/fb2"]);
  });

  it("регистр формата позиции не важен", async () => {
    mockedGetOfflineBooks.mockResolvedValue([offlineBook(["EPUB", "FB2"])]);
    mockedGetProgress.mockResolvedValue({ bookId: 1, fraction: 0.3, lastFormat: "FB2" });

    expect(await renderShellAndReadHref()).toEqual(["/book/1/read/fb2"]);
  });

  it("у каждой книги свой формат последнего чтения", async () => {
    // Полка сортирует по последнему обращению: сначала книга 2, потом 1 — в этом порядке и спрашиваются позиции.
    mockedGetOfflineBooks.mockResolvedValue([
      offlineBook(["EPUB", "FB2"], 1, 100),
      offlineBook(["EPUB", "FB2"], 2, 200),
    ]);
    mockedGetProgress
      .mockResolvedValueOnce({ bookId: 2, fraction: 0.5, lastFormat: "epub" })
      .mockResolvedValueOnce({ bookId: 1, fraction: 0.3, lastFormat: "fb2" });

    expect((await renderShellAndReadHref()).sort()).toEqual(["/book/1/read/fb2", "/book/2/read/epub"]);
  });
});
