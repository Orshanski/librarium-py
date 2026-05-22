import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { initDB, _resetDB, saveOfflineBook, getOfflineBook } from "../offline-storage";
import type { Book } from "../../types";

describe("Offline storage v5", () => {
  beforeEach(async () => {
    await _resetDB();
  });

  it("saves and reads a snapshot with full card fields", async () => {
    const book: Book = {
      id: 1,
      title: "T",
      authors: [{ id: 10, name: "A" }],
      series: { id: 5, name: "S" },
      seriesNumber: 1,
      coverPath: "/c",
      rating: 4,
      isRead: true,
      tags: [],
    };
    const coverBlob = new Blob(["fake"], { type: "image/jpeg" });
    await saveOfflineBook(book, [], coverBlob);
    const stored = await getOfflineBook(1);
    expect(stored).not.toBeNull();
    expect(stored!.series).toEqual({ id: 5, name: "S" });
    expect(stored!.rating).toBe(4);
    expect(stored!.isRead).toBe(true);
    expect(stored!.authors).toEqual([{ id: 10, name: "A" }]);
  });

  it("DB_VERSION is 5", async () => {
    const db = await initDB();
    expect(db.version).toBe(5);
  });

  it("old v4 snapshot remains readable with new fields as null/default", async () => {
    const { openDB, deleteDB } = await import("idb");
    await deleteDB("librarium-offline");

    const dbV4 = await openDB("librarium-offline", 4, {
      upgrade(db) {
        db.createObjectStore("offline_books", { keyPath: "bookId" });
        db.createObjectStore("reading_progress", { keyPath: "bookId" });
        db.createObjectStore("reader_settings", { keyPath: "deviceType" });
      },
    });
    const coverBuffer = await new Blob(["fake"], { type: "image/jpeg" }).arrayBuffer();
    await dbV4.put("offline_books", {
      bookId: 99,
      title: "Legacy",
      authors: ["Old Author"], // v4: string[]
      coverBuffer,
      coverType: "image/jpeg",
      formats: [],
      savedAt: 1700000000000,
      lastAccessedAt: 1700000000000,
      manuallyAdded: false,
    });
    dbV4.close();

    // Reopen via initDB (now at v5)
    const stored = await getOfflineBook(99);

    expect(stored).not.toBeNull();
    expect(stored!.bookId).toBe(99);
    expect(stored!.title).toBe("Legacy");
    expect(stored!.series).toBeNull();
    expect(stored!.seriesNumber).toBeNull();
    expect(stored!.rating).toBeNull();
    expect(stored!.isRead).toBe(false);
    expect(stored!.authors).toEqual([{ id: 0, name: "Old Author" }]);
  });
});
