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
  evictExpired,
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
