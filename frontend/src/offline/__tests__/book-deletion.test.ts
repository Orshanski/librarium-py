import "fake-indexeddb/auto";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainEvents } from "@/domain/events";
import type { Book } from "@/types";
import {
  _resetDB,
  getProgress,
  hasOfflineBook,
  initDB,
  saveOfflineBook,
  saveProgress,
} from "@/utils/offline-storage";
import {
  handleDeletedBookOfflineState,
  handleReadBookOfflineState,
  registerOfflineBookDeletionHandler,
  registerOfflineBookReadHandler,
} from "../book-deletion";

function makeBook(id: number, title: string): Book {
  return {
    id,
    title,
    authors: [],
    series: null,
    seriesNumber: null,
    coverPath: "",
    rating: null,
    isRead: false,
    tags: [],
  };
}

describe("offline book deletion subscriber", () => {
  const cover = new Blob(["cover"], { type: "image/jpeg" });
  const files = [{ format: "EPUB", fileBlob: new Blob(["epub"]), fileSize: 4 }];

  beforeEach(async () => {
    domainEvents.clear();
    await initDB();
    await _resetDB();
    await initDB();
  });

  it("removes offline book data and local progress for a deleted book", async () => {
    await saveOfflineBook(makeBook(1, "Deleted"), files, cover);
    await saveOfflineBook(makeBook(2, "Kept"), files, cover);
    await saveProgress(1, { position: "p1", fraction: 0.3, lastFormat: "epub", lastReadAt: 1000 });
    await saveProgress(2, { position: "p2", fraction: 0.7, lastFormat: "epub", lastReadAt: 2000 });

    await handleDeletedBookOfflineState({ bookId: 1 });

    expect(await hasOfflineBook(1)).toBe(false);
    expect(await getProgress(1)).toBeNull();
    expect(await hasOfflineBook(2)).toBe(true);
    expect(await getProgress(2)).not.toBeNull();
  });

  it("subscribes to bookDeleted and performs best-effort cleanup", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    registerOfflineBookDeletionHandler(domainEvents, cleanup);

    domainEvents.publish("bookDeleted", { bookId: 7 });

    await waitFor(() => expect(cleanup).toHaveBeenCalledWith({ bookId: 7 }));
  });

  it("logs cleanup failures without throwing from domain publication", async () => {
    const cleanup = vi.fn().mockRejectedValue(new Error("idb failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    registerOfflineBookDeletionHandler(domainEvents, cleanup);

    expect(() => domainEvents.publish("bookDeleted", { bookId: 7 })).not.toThrow();

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith("Failed to remove deleted book local state", expect.any(Error));
    });
    warn.mockRestore();
  });

  it("removes offline book data and local progress for a read book", async () => {
    await saveOfflineBook(makeBook(1, "Read"), files, cover);
    await saveOfflineBook(makeBook(2, "Kept"), files, cover);
    await saveProgress(1, { position: "p1", fraction: 0.3, lastFormat: "epub", lastReadAt: 1000 });
    await saveProgress(2, { position: "p2", fraction: 0.7, lastFormat: "epub", lastReadAt: 2000 });

    await handleReadBookOfflineState({ bookId: 1, isRead: true });

    expect(await hasOfflineBook(1)).toBe(false);
    expect(await getProgress(1)).toBeNull();
    expect(await hasOfflineBook(2)).toBe(true);
    expect(await getProgress(2)).not.toBeNull();
  });

  it("does not change offline book data when a read state changes to false", async () => {
    await saveOfflineBook(makeBook(1, "Unread"), files, cover);
    await saveProgress(1, { position: "p1", fraction: 0.3, lastFormat: "epub", lastReadAt: 1000 });

    await handleReadBookOfflineState({ bookId: 1, isRead: false });

    expect(await hasOfflineBook(1)).toBe(true);
    expect(await getProgress(1)).not.toBeNull();
  });

  it("subscribes to read changes and cleans up only when a book becomes read", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    registerOfflineBookReadHandler(domainEvents, cleanup);

    domainEvents.publish("bookReadChanged", { bookId: 7, isRead: false });
    domainEvents.publish("bookReadChanged", { bookId: 8, isRead: true });

    await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
    expect(cleanup).toHaveBeenCalledWith({ bookId: 8, isRead: true });
  });

  it("logs read cleanup failures without throwing from domain publication", async () => {
    const cleanup = vi.fn().mockRejectedValue(new Error("idb failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    registerOfflineBookReadHandler(domainEvents, cleanup);

    expect(() => domainEvents.publish("bookReadChanged", { bookId: 7, isRead: true })).not.toThrow();

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith("Failed to remove read book local state", expect.any(Error));
    });
    warn.mockRestore();
  });
});
