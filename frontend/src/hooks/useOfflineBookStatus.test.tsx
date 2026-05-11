import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { removeBookFromLocalStorage, removeOfflineBook } from "../utils/offline-storage";
import { useOfflineBookStatus } from "./useOfflineBookStatus";

vi.mock("./useIsPwa", () => ({
  useIsPwa: () => true,
}));

vi.mock("../utils/offline-storage", () => ({
  hasOfflineBook: vi.fn().mockResolvedValue(false),
  saveOfflineBook: vi.fn().mockResolvedValue(undefined),
  removeOfflineBook: vi.fn().mockResolvedValue(undefined),
  removeBookFromLocalStorage: vi.fn().mockResolvedValue(undefined),
}));

describe("useOfflineBookStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("evict removes all local book state, including reading progress", async () => {
    const { result } = renderHook(() => useOfflineBookStatus(7));

    await act(async () => {
      await result.current.evict();
    });

    expect(removeBookFromLocalStorage).toHaveBeenCalledWith(7);
    expect(removeOfflineBook).not.toHaveBeenCalled();
  });
});
