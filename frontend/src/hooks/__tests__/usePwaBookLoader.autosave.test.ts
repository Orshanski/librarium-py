// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/endpoints/books", () => ({ downloadBook: vi.fn() }));
vi.mock("@/api/endpoints/covers", () => ({ getCover: vi.fn() }));

import { downloadBook } from "@/api/endpoints/books";
import { getCover } from "@/api/endpoints/covers";
import type { BookDetailResponse } from "@/api/endpoints/books";
import { initDB, _resetDB, saveOfflineBook, getOfflineBook } from "../../utils/offline-storage";
import { autoSaveOfflineBook } from "../usePwaBookLoader";

const mockedDownloadBook = downloadBook as ReturnType<typeof vi.fn>;
const mockedGetCover = getCover as ReturnType<typeof vi.fn>;

const book = {
  id: 5,
  title: "Книга",
  authors: [],
  series: null,
  seriesNumber: null,
  coverPath: "",
  rating: null,
  isRead: false,
  tags: [],
};

const detail = {
  book,
  files: [
    { id: 1, format: "EPUB", fileSize: 10 },
    { id: 2, format: "FB2", fileSize: 20 },
  ],
  identifiers: [],
} as unknown as BookDetailResponse;

beforeEach(async () => {
  vi.clearAllMocks();
  mockedGetCover.mockResolvedValue(new Blob(["cover"], { type: "image/jpeg" }));
  mockedDownloadBook.mockResolvedValue(new Blob(["other"]));
  await initDB();
  await _resetDB();
  await initDB();
});

describe("автосохранение при чтении (97id)", () => {
  it("сохраняет только читаемый формат, остальные не качает", async () => {
    await autoSaveOfflineBook(5, "fb2", new Blob(["fb2-body"]), detail);

    expect(mockedDownloadBook).not.toHaveBeenCalled();
    const stored = await getOfflineBook(5);
    expect(stored?.formats.map((f) => f.format)).toEqual(["FB2"]);
    expect(stored?.manuallyAdded).toBe(false);
  });

  it("книга уже сохранена в другом формате — форматы складываются, ручной признак остаётся", async () => {
    await saveOfflineBook(book, [{ format: "EPUB", fileBlob: new Blob(["epub-body"]), fileSize: 10 }], new Blob(["c"]), true);

    await autoSaveOfflineBook(5, "fb2", new Blob(["fb2-body"]), detail);

    const stored = await getOfflineBook(5);
    // Старый код тоже давал оба формата (докачивал epub); эта проверка ловит неполную правку,
    // записавшую только читаемый формат поверх сохранённых.
    expect(stored?.formats.map((f) => f.format).sort()).toEqual(["EPUB", "FB2"]);
    expect(stored?.manuallyAdded).toBe(true);
    expect(mockedDownloadBook).not.toHaveBeenCalled();
  });
});
