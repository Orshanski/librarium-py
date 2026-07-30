// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { domainEvents } from "@/domain/events";

vi.mock("@/hooks/useIsPwa", () => ({
  useIsPwa: () => true,
}));

vi.mock("@/utils/offline-storage", () => ({
  getOfflineBookIds: vi.fn(),
}));

import { getOfflineBookIds } from "@/utils/offline-storage";
import { useOfflineBookIds } from "../useOfflineBookIds";

const mockedGetIds = getOfflineBookIds as ReturnType<typeof vi.fn>;

describe("useOfflineBookIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainEvents.clear();
  });

  it("отдаёт набор сохранённых книг", async () => {
    mockedGetIds.mockResolvedValue([1, 7]);

    const { result } = renderHook(() => useOfflineBookIds());

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.has(7)).toBe(true);
    expect(result.current.has(2)).toBe(false);
  });

  it("перечитывает набор, когда книгу сохранили или удалили", async () => {
    // Без этого набор оставался снимком: сохранил книгу на её странице — а бейдж
    // на карточке той же книги в рельсе серии рядом так и не появился.
    mockedGetIds.mockResolvedValueOnce([]).mockResolvedValueOnce([42]);

    const { result } = renderHook(() => useOfflineBookIds());
    await waitFor(() => expect(mockedGetIds).toHaveBeenCalledTimes(1));
    expect(result.current.has(42)).toBe(false);

    act(() => {
      domainEvents.publish("offlineBookChanged", { bookId: 42, hasOffline: true });
    });

    await waitFor(() => expect(result.current.has(42)).toBe(true));
  });

  it("не роняет приложение, если хранилище недоступно", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockedGetIds.mockRejectedValue(new Error("IndexedDB unavailable"));

    const { result } = renderHook(() => useOfflineBookIds());

    await waitFor(() => expect(mockedGetIds).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
    warn.mockRestore();
  });
});
