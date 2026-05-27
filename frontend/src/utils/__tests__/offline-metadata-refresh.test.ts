import { describe, it, expect, vi, beforeEach } from "vitest";
import { refreshOfflineSnapshots } from "../offline-metadata-refresh";
import * as offlineStorage from "../offline-storage";
import * as booksApi from "../../api/endpoints/books";

const mockBookDetailResponse = (overrides: Partial<{ id: number; title: string; series: { id: number; name: string } | null; rating: number | null; isRead: boolean }> = {}) => ({
  book: {
    id: 1, title: "T", authors: [], series: null, seriesNumber: null,
    coverPath: "/c", rating: null, isRead: false,
    sortTitle: null, description: null, language: null, publisher: null,
    pubDate: null, tags: [], addedAt: "2020-01-01 00:00:00", updatedAt: "2020-01-01 00:00:00",
    ...overrides,
  },
  files: [],
  identifiers: [],
});

describe("refreshOfflineSnapshots", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches metadata for each local book and writes back to IDB", async () => {
    vi.spyOn(offlineStorage, "getOfflineBooks").mockResolvedValue([
      { bookId: 1, title: "Old", series: null, rating: 3 } as unknown as offlineStorage.OfflineBook,
    ]);
    const updateMetaSpy = vi.spyOn(offlineStorage, "updateOfflineBookMetadata").mockResolvedValue();
    vi.spyOn(booksApi, "getBook").mockResolvedValue(
      mockBookDetailResponse({ title: "New", series: { id: 5, name: "S" }, rating: 5, isRead: false }) as unknown as booksApi.BookDetailResponse,
    );

    await refreshOfflineSnapshots();

    expect(updateMetaSpy).toHaveBeenCalledTimes(1);
    expect(updateMetaSpy.mock.calls[0][0]).toBe(1);
    expect(updateMetaSpy.mock.calls[0][1]).toMatchObject({
      title: "New", rating: 5, series: { id: 5, name: "S" },
    });
  });

  it("removes local offline book data when fresh metadata says the book is read", async () => {
    vi.spyOn(offlineStorage, "getOfflineBooks").mockResolvedValue([
      { bookId: 1, title: "Old" } as unknown as offlineStorage.OfflineBook,
    ]);
    const updateMetaSpy = vi.spyOn(offlineStorage, "updateOfflineBookMetadata").mockResolvedValue();
    const removeSpy = vi.spyOn(offlineStorage, "removeBookFromLocalStorage").mockResolvedValue();
    vi.spyOn(booksApi, "getBook").mockResolvedValue(
      mockBookDetailResponse({ title: "Read remotely", isRead: true }) as unknown as booksApi.BookDetailResponse,
    );

    await refreshOfflineSnapshots();

    expect(removeSpy).toHaveBeenCalledWith(1);
    expect(updateMetaSpy).not.toHaveBeenCalled();
  });

  it("skips books that fail to fetch (404 or network)", async () => {
    vi.spyOn(offlineStorage, "getOfflineBooks").mockResolvedValue([
      { bookId: 1 } as unknown as offlineStorage.OfflineBook,
      { bookId: 2 } as unknown as offlineStorage.OfflineBook,
    ]);
    vi.spyOn(booksApi, "getBook").mockImplementation((id: number) => {
      if (id === 1) return Promise.reject(new Error("404"));
      return Promise.resolve(mockBookDetailResponse({ id: 2, title: "B2" }) as unknown as booksApi.BookDetailResponse);
    });
    const updateSpy = vi.spyOn(offlineStorage, "updateOfflineBookMetadata").mockResolvedValue();

    await refreshOfflineSnapshots();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toBe(2);
  });

  it("does not touch binary fields (coverBlob, formats)", async () => {
    vi.spyOn(offlineStorage, "getOfflineBooks").mockResolvedValue([
      { bookId: 1 } as unknown as offlineStorage.OfflineBook,
    ]);
    const updateSpy = vi.spyOn(offlineStorage, "updateOfflineBookMetadata").mockResolvedValue();
    vi.spyOn(booksApi, "getBook").mockResolvedValue(mockBookDetailResponse() as unknown as booksApi.BookDetailResponse);

    await refreshOfflineSnapshots();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const metadata = updateSpy.mock.calls[0][1];
    expect(metadata).not.toHaveProperty("coverBlob");
    expect(metadata).not.toHaveProperty("coverBuffer");
    expect(metadata).not.toHaveProperty("formats");
    expect(metadata).not.toHaveProperty("savedAt");
    expect(Object.keys(metadata).sort()).toEqual(
      ["authors", "isRead", "rating", "series", "seriesNumber", "title"].sort(),
    );
  });

  it("does nothing when there are no local books", async () => {
    vi.spyOn(offlineStorage, "getOfflineBooks").mockResolvedValue([]);
    const updateSpy = vi.spyOn(offlineStorage, "updateOfflineBookMetadata").mockResolvedValue();
    const getBookSpy = vi.spyOn(booksApi, "getBook");

    await refreshOfflineSnapshots();

    expect(getBookSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
