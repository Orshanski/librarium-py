import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainEvents } from "@/domain/events";
import { removeBookFromLocalStorage } from "@/utils/offline-storage";
import { installOfflineStorageHandlersForApp, resetOfflineStorageHandlersForTests } from "../bootstrap";

vi.mock("@/utils/offline-storage", () => ({
  removeBookFromLocalStorage: vi.fn().mockResolvedValue(undefined),
}));

describe("installOfflineStorageHandlersForApp", () => {
  beforeEach(() => {
    domainEvents.clear();
    resetOfflineStorageHandlersForTests();
    vi.mocked(removeBookFromLocalStorage).mockClear();
  });

  it("registers offline handlers only once", async () => {
    installOfflineStorageHandlersForApp();
    installOfflineStorageHandlersForApp();
    domainEvents.publish("bookDeleted", { bookId: 7 });

    await waitFor(() => expect(removeBookFromLocalStorage).toHaveBeenCalledTimes(1));
    expect(removeBookFromLocalStorage).toHaveBeenCalledWith(7);
  });
});
