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

  it("registers offline deletion and read handlers only once", async () => {
    installOfflineStorageHandlersForApp();
    installOfflineStorageHandlersForApp();
    domainEvents.publish("bookDeleted", { bookId: 7 });
    domainEvents.publish("bookReadChanged", { bookId: 8, isRead: true });
    domainEvents.publish("bookReadChanged", { bookId: 9, isRead: false });

    await waitFor(() => expect(removeBookFromLocalStorage).toHaveBeenCalledTimes(2));
    expect(removeBookFromLocalStorage).toHaveBeenCalledWith(7);
    expect(removeBookFromLocalStorage).toHaveBeenCalledWith(8);
  });

  it("runs offline read cleanup once for local read events", async () => {
    installOfflineStorageHandlersForApp();

    domainEvents.publish("bookReadChanged", { bookId: 8, isRead: true });

    await waitFor(() => expect(removeBookFromLocalStorage).toHaveBeenCalledWith(8));
    expect(removeBookFromLocalStorage).toHaveBeenCalledTimes(1);
  });
});
