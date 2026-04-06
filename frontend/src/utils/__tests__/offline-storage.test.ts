import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  initDB,
  _resetDB,
  cacheBook,
  getCachedBooks,
  getCachedBook,
  isCached,
  removeCachedBook,
  touchBook,
  saveProgress,
  getProgress,
  getUnsyncedProgress,
  markProgressSynced,
  saveSettings,
  getSettings,
  getUnsyncedSettings,
  markSettingsSynced,
  evictExpired,
  evictLRU,
  getStorageUsage,
} from "../offline-storage";

beforeEach(async () => {
  await initDB();   // ensure DB exists
  await _resetDB(); // clear all stores
  await initDB();   // re-init fresh promise
});

describe("book cache", () => {
  const meta = { bookId: 1, title: "Test Book", authors: ["Author"] };
  const cover = new Blob(["cover"], { type: "image/jpeg" });
  const files = [{ format: "EPUB", fileBlob: new Blob(["epub"]), fileSize: 4 }];

  it("cacheBook + getCachedBook", async () => {
    await cacheBook(meta, files, cover);
    const book = await getCachedBook(1);
    expect(book).not.toBeNull();
    expect(book!.title).toBe("Test Book");
    expect(book!.authors).toEqual(["Author"]);
    expect(book!.formats).toHaveLength(1);
    expect(book!.formats[0].format).toBe("EPUB");
  });

  it("getCachedBooks returns all cached", async () => {
    await cacheBook(meta, files, cover);
    await cacheBook({ bookId: 2, title: "Book 2", authors: ["B"] }, files, cover);
    const books = await getCachedBooks();
    expect(books).toHaveLength(2);
    // Verify actual Blob reconstruction (not raw ArrayBuffers)
    for (const book of books) {
      expect(book.coverBlob).toBeInstanceOf(Blob);
      expect(book.coverBlob.size).toBeGreaterThan(0);
      for (const f of book.formats) {
        expect(f.fileBlob).toBeInstanceOf(Blob);
        expect(f.fileBlob.size).toBeGreaterThan(0);
      }
    }
  });

  it("isCached returns true/false", async () => {
    expect(await isCached(1)).toBe(false);
    await cacheBook(meta, files, cover);
    expect(await isCached(1)).toBe(true);
  });

  it("removeCachedBook removes from cache", async () => {
    await cacheBook(meta, files, cover);
    await removeCachedBook(1);
    expect(await isCached(1)).toBe(false);
  });

  it("touchBook updates lastAccessedAt", async () => {
    await cacheBook(meta, files, cover);
    const before = (await getCachedBook(1))!.lastAccessedAt;
    await new Promise((r) => setTimeout(r, 10));
    await touchBook(1);
    const after = (await getCachedBook(1))!.lastAccessedAt;
    expect(after).toBeGreaterThan(before);
  });

  it("cacheBook sets manuallyAdded to false by default", async () => {
    await cacheBook(meta, files, cover);
    const book = await getCachedBook(1);
    expect(book!.manuallyAdded).toBe(false);
  });

  it("cacheBook sets manuallyAdded when specified", async () => {
    await cacheBook({ ...meta, manuallyAdded: true }, files, cover);
    const book = await getCachedBook(1);
    expect(book!.manuallyAdded).toBe(true);
  });
});

describe("reading progress", () => {
  it("saveProgress + getProgress", async () => {
    await saveProgress(1, {
      position: '{"kind":"cfi","value":"epubcfi(/6/4)"}',
      fraction: 0.42,
      lastFormat: "epub",
      lastReadAt: Date.now(),
    });
    const p = await getProgress(1);
    expect(p).not.toBeNull();
    expect(p!.fraction).toBe(0.42);
    expect(p!.synced).toBe(false);
  });

  it("getUnsyncedProgress returns unsynced only", async () => {
    await saveProgress(1, { position: "a", fraction: 0.1, lastFormat: "epub", lastReadAt: Date.now() });
    await saveProgress(2, { position: "b", fraction: 0.2, lastFormat: "pdf", lastReadAt: Date.now() });
    await markProgressSynced(1);
    const unsynced = await getUnsyncedProgress();
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].bookId).toBe(2);
  });
});

describe("reader settings", () => {
  it("saveSettings + getSettings", async () => {
    const s = { fontSize: 18, theme: "dark" };
    await saveSettings("device-1", s);
    const result = await getSettings("device-1");
    expect(result).not.toBeNull();
    expect(result!.settings.fontSize).toBe(18);
  });

  it("returns null for unknown device", async () => {
    const result = await getSettings("unknown");
    expect(result).toBeNull();
  });

  it("getUnsyncedSettings returns unsynced only", async () => {
    await saveSettings("device-1", { fontSize: 18 });
    await saveSettings("device-2", { fontSize: 20 });
    await markSettingsSynced("device-1");
    const unsynced = await getUnsyncedSettings();
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].deviceType).toBe("device-2");
  });
});

describe("eviction", () => {
  const cover = new Blob(["c"]);
  const files = [{ format: "EPUB", fileBlob: new Blob(["e"]), fileSize: 1 }];

  it("evictExpired removes old books", async () => {
    await cacheBook({ bookId: 1, title: "Old", authors: [] }, files, cover);
    const db = await initDB();
    const book = await db.get("cached_books", 1);
    book!.lastAccessedAt = Date.now() - 15 * 24 * 60 * 60 * 1000;
    await db.put("cached_books", book!);

    const count = await evictExpired(14 * 24 * 60 * 60 * 1000);
    expect(count).toBe(1);
    expect(await isCached(1)).toBe(false);
  });

  it("evictExpired keeps fresh books", async () => {
    await cacheBook({ bookId: 1, title: "Fresh", authors: [] }, files, cover);
    const count = await evictExpired(14 * 24 * 60 * 60 * 1000);
    expect(count).toBe(0);
    expect(await isCached(1)).toBe(true);
  });
});

describe("evictLRU", () => {
  const cover = new Blob(["c"]);

  it("evicts at least one book when called with no target", async () => {
    const files = [{ format: "EPUB", fileBlob: new Blob(["e"]), fileSize: 100 }];
    await cacheBook({ bookId: 1, title: "A", authors: [] }, files, cover);
    await cacheBook({ bookId: 2, title: "B", authors: [] }, files, cover);

    // Make book 1 older
    const db = await initDB();
    const book1 = await db.get("cached_books", 1);
    book1!.lastAccessedAt = Date.now() - 10000;
    await db.put("cached_books", book1!);

    const evicted = await evictLRU();
    expect(evicted).toHaveLength(1);
    expect(evicted[0]).toBe(1);
    expect(await isCached(1)).toBe(false);
    expect(await isCached(2)).toBe(true);
  });

  it("evicts multiple books until targetBytes is met", async () => {
    const smallFiles = [{ format: "EPUB", fileBlob: new Blob(["e"]), fileSize: 50 }];
    await cacheBook({ bookId: 1, title: "A", authors: [] }, smallFiles, cover);
    await cacheBook({ bookId: 2, title: "B", authors: [] }, smallFiles, cover);
    await cacheBook({ bookId: 3, title: "C", authors: [] }, smallFiles, cover);

    // Make books progressively older
    const db = await initDB();
    const b1 = await db.get("cached_books", 1);
    b1!.lastAccessedAt = Date.now() - 30000;
    await db.put("cached_books", b1!);
    const b2 = await db.get("cached_books", 2);
    b2!.lastAccessedAt = Date.now() - 20000;
    await db.put("cached_books", b2!);

    const evicted = await evictLRU(80);
    expect(evicted).toHaveLength(2); // 50 + 50 >= 80
    expect(evicted).toContain(1);
    expect(evicted).toContain(2);
    expect(await isCached(3)).toBe(true);
  });

  it("returns empty array when no books cached", async () => {
    const evicted = await evictLRU(100);
    expect(evicted).toEqual([]);
  });

  it("skips manually-added books", async () => {
    const files = [{ format: "EPUB", fileBlob: new Blob(["e"]), fileSize: 100 }];
    await cacheBook({ bookId: 1, title: "Manual", authors: [], manuallyAdded: true }, files, cover);
    await cacheBook({ bookId: 2, title: "Auto", authors: [], manuallyAdded: false }, files, cover);

    // Make manual book older
    const db = await initDB();
    const b1 = await db.get("cached_books", 1);
    b1!.lastAccessedAt = Date.now() - 30000;
    await db.put("cached_books", b1!);

    const evicted = await evictLRU();
    expect(evicted).toHaveLength(1);
    expect(evicted[0]).toBe(2); // auto book evicted, not manual
    expect(await isCached(1)).toBe(true);
  });
});

describe("getStorageUsage", () => {
  it("returns correct count and total bytes", async () => {
    const cover = new Blob(["c"]);
    const files1 = [{ format: "EPUB", fileBlob: new Blob(["e"]), fileSize: 100 }];
    const files2 = [
      { format: "EPUB", fileBlob: new Blob(["e"]), fileSize: 200 },
      { format: "PDF", fileBlob: new Blob(["p"]), fileSize: 300 },
    ];
    await cacheBook({ bookId: 1, title: "A", authors: [] }, files1, cover);
    await cacheBook({ bookId: 2, title: "B", authors: [] }, files2, cover);

    const usage = await getStorageUsage();
    expect(usage.bookCount).toBe(2);
    expect(usage.totalBytes).toBe(600);
  });

  it("returns zero when no books cached", async () => {
    const usage = await getStorageUsage();
    expect(usage.bookCount).toBe(0);
    expect(usage.totalBytes).toBe(0);
  });
});
