// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../utils/offline-storage", () => ({
  getOfflineBooks: vi.fn(),
  getProgress: vi.fn(),
}));

import { getOfflineBooks, getProgress } from "../../utils/offline-storage";
import { useOfflineBooks } from "../OfflineShell";

const mockedGetOfflineBooks = getOfflineBooks as ReturnType<typeof vi.fn>;
const mockedGetProgress = getProgress as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useOfflineBooks", () => {
  it("loads books, sorts by lastAccessedAt desc, and exposes them once loading completes", async () => {
    mockedGetOfflineBooks.mockResolvedValue([
      { bookId: 1, title: "A", lastAccessedAt: 100 },
      { bookId: 2, title: "B", lastAccessedAt: 200 },
    ]);
    mockedGetProgress.mockResolvedValue(null);

    const { result } = renderHook(() => useOfflineBooks());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.books.map((b) => b.bookId)).toEqual([2, 1]);
  });

  it("rounds fraction>0 progress to percent and skips books with no/zero progress", async () => {
    mockedGetOfflineBooks.mockResolvedValue([
      { bookId: 1, title: "Read 30%", lastAccessedAt: 0 },
      { bookId: 2, title: "Untouched", lastAccessedAt: 0 },
      { bookId: 3, title: "Just opened", lastAccessedAt: 0 },
    ]);
    mockedGetProgress
      .mockResolvedValueOnce({ bookId: 1, fraction: 0.305 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ bookId: 3, fraction: 0 });

    const { result } = renderHook(() => useOfflineBooks());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.progressMap.get(1)).toBe(31);
    expect(result.current.progressMap.has(2)).toBe(false);
    expect(result.current.progressMap.has(3)).toBe(false);
  });

  it("survives a getProgress rejection per book — silently skips that entry", async () => {
    mockedGetOfflineBooks.mockResolvedValue([
      { bookId: 1, title: "OK", lastAccessedAt: 0 },
      { bookId: 2, title: "Errors", lastAccessedAt: 0 },
    ]);
    mockedGetProgress
      .mockResolvedValueOnce({ bookId: 1, fraction: 0.5 })
      .mockRejectedValueOnce(new Error("idb fail"));

    const { result } = renderHook(() => useOfflineBooks());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.progressMap.get(1)).toBe(50);
    expect(result.current.progressMap.has(2)).toBe(false);
  });

  it("flips loading=false and stays empty when getOfflineBooks rejects (no crash)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockedGetOfflineBooks.mockRejectedValue(new Error("db unavailable"));

    const { result } = renderHook(() => useOfflineBooks());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.books).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      "OfflineShell: failed to load offline books:",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
