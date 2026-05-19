import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDB, type IDBPTransaction } from "idb";
import type { Book } from "../../types";
import {
  initDB,
  _resetDB,
  saveOfflineBook,
  getOfflineBooks,
  getOfflineBook,
  hasOfflineBook,
  removeOfflineBook,
  removeBookFromLocalStorage,
  touchOfflineBook,
  saveProgress,
  getProgress,
  getUnsyncedProgress,
  markProgressSynced,
  getLastReadBook,
  saveSettings,
  getSettings,
  getUnsyncedSettings,
  markSettingsSynced,
  evictExpired,
  evictLRU,
  getStorageUsage,
} from "../offline-storage";

function makeBook(overrides: Partial<Book> & { id: number; title: string }): Book {
  return {
    id: overrides.id,
    title: overrides.title,
    authors: overrides.authors ?? [],
    series: overrides.series ?? null,
    seriesNumber: overrides.seriesNumber ?? null,
    coverPath: overrides.coverPath ?? "",
    rating: overrides.rating ?? null,
    isRead: overrides.isRead ?? false,
  };
}

beforeEach(async () => {
  await initDB();   // ensure DB exists
  await _resetDB(); // clear all stores
  await initDB();   // re-init fresh promise
});

describe("offline book storage", () => {
  const book = makeBook({ id: 1, title: "Test Book", authors: [{ id: 10, name: "Author" }] });
  const cover = new Blob(["cover"], { type: "image/jpeg" });
  const files = [{ format: "EPUB", fileBlob: new Blob(["epub"]), fileSize: 4 }];

  it("saveOfflineBook + getOfflineBook", async () => {
    await saveOfflineBook(book, files, cover);
    const stored = await getOfflineBook(1);
    expect(stored).not.toBeNull();
    expect(stored!.title).toBe("Test Book");
    expect(stored!.authors).toEqual([{ id: 10, name: "Author" }]);
    expect(stored!.formats).toHaveLength(1);
    expect(stored!.formats[0].format).toBe("EPUB");
  });

  it("getOfflineBooks returns all", async () => {
    await saveOfflineBook(book, files, cover);
    await saveOfflineBook(makeBook({ id: 2, title: "Book 2", authors: [{ id: 11, name: "B" }] }), files, cover);
    const books = await getOfflineBooks();
    expect(books).toHaveLength(2);
    // Verify actual Blob reconstruction (not raw ArrayBuffers)
    for (const b of books) {
      expect(b.coverBlob).toBeInstanceOf(Blob);
      expect(b.coverBlob.size).toBeGreaterThan(0);
      for (const f of b.formats) {
        expect(f.fileBlob).toBeInstanceOf(Blob);
        expect(f.fileBlob.size).toBeGreaterThan(0);
      }
    }
  });

  it("hasOfflineBook returns true/false", async () => {
    expect(await hasOfflineBook(1)).toBe(false);
    await saveOfflineBook(book, files, cover);
    expect(await hasOfflineBook(1)).toBe(true);
  });

  it("removeOfflineBook removes from offline storage", async () => {
    await saveOfflineBook(book, files, cover);
    await removeOfflineBook(1);
    expect(await hasOfflineBook(1)).toBe(false);
  });

  it("touchOfflineBook updates lastAccessedAt", async () => {
    await saveOfflineBook(book, files, cover);
    const before = (await getOfflineBook(1))!.lastAccessedAt;
    await new Promise((r) => setTimeout(r, 10));
    await touchOfflineBook(1);
    const after = (await getOfflineBook(1))!.lastAccessedAt;
    expect(after).toBeGreaterThan(before);
  });

  it("saveOfflineBook sets manuallyAdded to false by default", async () => {
    await saveOfflineBook(book, files, cover);
    const stored = await getOfflineBook(1);
    expect(stored!.manuallyAdded).toBe(false);
  });

  it("saveOfflineBook sets manuallyAdded when specified", async () => {
    await saveOfflineBook(book, files, cover, true);
    const stored = await getOfflineBook(1);
    expect(stored!.manuallyAdded).toBe(true);
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

  it("saveProgress defaults serverVersion to 0 on new row", async () => {
    await saveProgress(1, { position: "a", fraction: 0.1, lastFormat: "epub", lastReadAt: 1000 });
    const p = await getProgress(1);
    expect(p!.serverVersion).toBe(0);
  });

  it("saveProgress preserves existing serverVersion across local-only writes", async () => {
    // First write: new row with explicit serverVersion = 5 (as if adopted from server)
    await saveProgress(1, {
      position: "a",
      fraction: 0.1,
      lastFormat: "epub",
      lastReadAt: 1000,
      serverVersion: 5,
    });
    // Local relocate: does NOT pass serverVersion — must preserve 5
    await saveProgress(1, {
      position: "b",
      fraction: 0.2,
      lastFormat: "epub",
      lastReadAt: 2000,
    });
    const p = await getProgress(1);
    expect(p!.position).toBe("b");
    expect(p!.serverVersion).toBe(5);
  });

  it("saveProgress updates serverVersion when explicitly provided", async () => {
    await saveProgress(1, {
      position: "a",
      fraction: 0.1,
      lastFormat: "epub",
      lastReadAt: 1000,
      serverVersion: 5,
    });
    // Simulate successful push response updating version
    await saveProgress(1, {
      position: "a",
      fraction: 0.1,
      lastFormat: "epub",
      lastReadAt: 1000,
      serverVersion: 6,
    });
    const p = await getProgress(1);
    expect(p!.serverVersion).toBe(6);
  });

  it("markProgressSynced does NOT touch lastReadAt (regression guard)", async () => {
    const readAt = 12345;
    await saveProgress(1, {
      position: "a",
      fraction: 0.1,
      lastFormat: "epub",
      lastReadAt: readAt,
    });
    await markProgressSynced(1);
    const p = await getProgress(1);
    expect(p!.lastReadAt).toBe(readAt); // must not be overwritten to Date.now()
    expect(p!.synced).toBe(true);
  });

  it("getUnsyncedProgress returns unsynced only", async () => {
    await saveProgress(1, { position: "a", fraction: 0.1, lastFormat: "epub", lastReadAt: Date.now() });
    await saveProgress(2, { position: "b", fraction: 0.2, lastFormat: "pdf", lastReadAt: Date.now() });
    await markProgressSynced(1);
    const unsynced = await getUnsyncedProgress();
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].bookId).toBe(2);
  });

  describe("getLastReadBook", () => {
    it("returns null on empty store", async () => {
      const last = await getLastReadBook();
      expect(last).toBeNull();
    });

    it("returns the row with the largest lastReadAt", async () => {
      await saveProgress(1, { position: "a", fraction: 0.1, lastFormat: "epub", lastReadAt: 1000 });
      await saveProgress(2, { position: "b", fraction: 0.2, lastFormat: "fb2", lastReadAt: 5000 });
      await saveProgress(3, { position: "c", fraction: 0.3, lastFormat: "pdf", lastReadAt: 3000 });
      const last = await getLastReadBook();
      expect(last).toEqual({ bookId: 2, lastFormat: "fb2" });
    });

    it("returns null when the latest row has empty lastFormat", async () => {
      await saveProgress(1, { position: "a", fraction: 0.1, lastFormat: "", lastReadAt: 1000 });
      const last = await getLastReadBook();
      expect(last).toBeNull();
    });
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
    await saveOfflineBook(makeBook({ id: 1, title: "Old" }), files, cover);
    const db = await initDB();
    const stored = await db.get("offline_books", 1);
    stored!.lastAccessedAt = Date.now() - 15 * 24 * 60 * 60 * 1000;
    await db.put("offline_books", stored!);

    const count = await evictExpired(14 * 24 * 60 * 60 * 1000);
    expect(count).toBe(1);
    expect(await hasOfflineBook(1)).toBe(false);
  });

  it("evictExpired keeps fresh books", async () => {
    await saveOfflineBook(makeBook({ id: 1, title: "Fresh" }), files, cover);
    const count = await evictExpired(14 * 24 * 60 * 60 * 1000);
    expect(count).toBe(0);
    expect(await hasOfflineBook(1)).toBe(true);
  });
});

describe("evictLRU", () => {
  const cover = new Blob(["c"]);

  it("evicts at least one book when called with no target", async () => {
    const files = [{ format: "EPUB", fileBlob: new Blob(["e"]), fileSize: 100 }];
    await saveOfflineBook(makeBook({ id: 1, title: "A" }), files, cover);
    await saveOfflineBook(makeBook({ id: 2, title: "B" }), files, cover);

    // Make book 1 older
    const db = await initDB();
    const book1 = await db.get("offline_books", 1);
    book1!.lastAccessedAt = Date.now() - 10000;
    await db.put("offline_books", book1!);

    const evicted = await evictLRU();
    expect(evicted).toHaveLength(1);
    expect(evicted[0]).toBe(1);
    expect(await hasOfflineBook(1)).toBe(false);
    expect(await hasOfflineBook(2)).toBe(true);
  });

  it("evicts multiple books until targetBytes is met", async () => {
    const smallFiles = [{ format: "EPUB", fileBlob: new Blob(["e"]), fileSize: 50 }];
    await saveOfflineBook(makeBook({ id: 1, title: "A" }), smallFiles, cover);
    await saveOfflineBook(makeBook({ id: 2, title: "B" }), smallFiles, cover);
    await saveOfflineBook(makeBook({ id: 3, title: "C" }), smallFiles, cover);

    // Make books progressively older
    const db = await initDB();
    const b1 = await db.get("offline_books", 1);
    b1!.lastAccessedAt = Date.now() - 30000;
    await db.put("offline_books", b1!);
    const b2 = await db.get("offline_books", 2);
    b2!.lastAccessedAt = Date.now() - 20000;
    await db.put("offline_books", b2!);

    const evicted = await evictLRU(80);
    expect(evicted).toHaveLength(2); // 50 + 50 >= 80
    expect(evicted).toContain(1);
    expect(evicted).toContain(2);
    expect(await hasOfflineBook(3)).toBe(true);
  });

  it("returns empty array when no books saved offline", async () => {
    const evicted = await evictLRU(100);
    expect(evicted).toEqual([]);
  });

  it("skips manually-added books", async () => {
    const files = [{ format: "EPUB", fileBlob: new Blob(["e"]), fileSize: 100 }];
    await saveOfflineBook(makeBook({ id: 1, title: "Manual" }), files, cover, true);
    await saveOfflineBook(makeBook({ id: 2, title: "Auto" }), files, cover, false);

    // Make manual book older
    const db = await initDB();
    const b1 = await db.get("offline_books", 1);
    b1!.lastAccessedAt = Date.now() - 30000;
    await db.put("offline_books", b1!);

    const evicted = await evictLRU();
    expect(evicted).toHaveLength(1);
    expect(evicted[0]).toBe(2); // auto book evicted, not manual
    expect(await hasOfflineBook(1)).toBe(true);
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
    await saveOfflineBook(makeBook({ id: 1, title: "A" }), files1, cover);
    await saveOfflineBook(makeBook({ id: 2, title: "B" }), files2, cover);

    const usage = await getStorageUsage();
    expect(usage.bookCount).toBe(2);
    expect(usage.totalBytes).toBe(602); // 100 + 200 + 300 + 2 covers (1 byte each)
  });

  it("returns zero when no books saved offline", async () => {
    const usage = await getStorageUsage();
    expect(usage.bookCount).toBe(0);
    expect(usage.totalBytes).toBe(0);
  });
});

describe("removeBookFromLocalStorage", () => {
  const cover = new Blob(["cover"], { type: "image/jpeg" });
  const files = [{ format: "EPUB", fileBlob: new Blob(["epub"]), fileSize: 4 }];

  it("removes book from offline_books store", async () => {
    await saveOfflineBook(makeBook({ id: 1, title: "X", authors: [{ id: 9, name: "A" }] }), files, cover);
    expect(await hasOfflineBook(1)).toBe(true);
    await removeBookFromLocalStorage(1);
    expect(await hasOfflineBook(1)).toBe(false);
  });

  it("removes reading_progress for the book", async () => {
    await saveProgress(1, { position: "cfi", fraction: 0.5, lastFormat: "epub", lastReadAt: Date.now() });
    expect(await getProgress(1)).not.toBeNull();
    await removeBookFromLocalStorage(1);
    expect(await getProgress(1)).toBeNull();
  });

  it("leaves other books untouched (offline + progress)", async () => {
    await saveOfflineBook(makeBook({ id: 1, title: "X" }), files, cover);
    await saveOfflineBook(makeBook({ id: 2, title: "Y" }), files, cover);
    await saveProgress(1, { position: "p1", fraction: 0.3, lastFormat: "epub", lastReadAt: Date.now() });
    await saveProgress(2, { position: "p2", fraction: 0.7, lastFormat: "epub", lastReadAt: Date.now() });

    await removeBookFromLocalStorage(1);

    expect(await hasOfflineBook(1)).toBe(false);
    expect(await hasOfflineBook(2)).toBe(true);
    expect(await getProgress(1)).toBeNull();
    expect(await getProgress(2)).not.toBeNull();
  });

  it("no-op when book is not in either store (does not throw)", async () => {
    await expect(removeBookFromLocalStorage(999)).resolves.not.toThrow();
  });
});

describe("IDB migration v3 → v4 (rename cached_books → offline_books)", () => {
  // Isolated DB — не полагаемся на beforeEach (_resetDB), который ещё на старых именах
  const MIGRATION_DB_NAME = "librarium-offline-migration-test";

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(MIGRATION_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it("при открытии DB с DB_VERSION=4 store называется offline_books", async () => {
    // Открыть на старой версии с cached_books, положить данные
    const dbV3 = await openDB(MIGRATION_DB_NAME, 3, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cached_books")) {
          db.createObjectStore("cached_books", { keyPath: "bookId" });
        }
        if (!db.objectStoreNames.contains("reading_progress")) {
          db.createObjectStore("reading_progress", { keyPath: "bookId" });
        }
        if (!db.objectStoreNames.contains("reader_settings")) {
          db.createObjectStore("reader_settings", { keyPath: "deviceType" });
        }
      },
    });
    await dbV3.put("cached_books", {
      bookId: 42,
      title: "Test",
      authors: ["A"],
      coverBuffer: new ArrayBuffer(8),
      coverType: "image/jpeg",
      formats: [],
      cachedAt: Date.now(),
      lastAccessedAt: Date.now(),
      manuallyAdded: false,
    });
    dbV3.close();

    // Открыть на новой версии — upgrade должен переименовать store и сохранить данные
    const dbV4 = await openDB<{ offline_books: { key: number; value: unknown }; reading_progress: { key: number; value: unknown }; reader_settings: { key: string; value: unknown } }>(MIGRATION_DB_NAME, 4, {
      upgrade(_db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 4) {
          const tx = transaction as unknown as IDBPTransaction<Record<string, unknown>, string[], "versionchange">;
          const storeNames = Array.from(tx.objectStoreNames);
          if (storeNames.includes("cached_books")) {
            tx.objectStore("cached_books").name = "offline_books";
          }
        }
      },
    });
    const names = Array.from(dbV4.objectStoreNames);
    expect(names).toContain("offline_books");
    expect(names).not.toContain("cached_books");

    // Данные перенеслись — проверяем
    const book = await dbV4.get("offline_books", 42);
    expect(book).toBeTruthy();
    dbV4.close();
  });

  it("rename сохраняет manuallyAdded=true для вручную добавленных книг", async () => {
    const dbV3 = await openDB(MIGRATION_DB_NAME, 3, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cached_books")) {
          db.createObjectStore("cached_books", { keyPath: "bookId" });
        }
        if (!db.objectStoreNames.contains("reading_progress")) {
          db.createObjectStore("reading_progress", { keyPath: "bookId" });
        }
        if (!db.objectStoreNames.contains("reader_settings")) {
          db.createObjectStore("reader_settings", { keyPath: "deviceType" });
        }
      },
    });
    await dbV3.put("cached_books", {
      bookId: 7,
      title: "Manual",
      authors: ["M"],
      coverBuffer: new ArrayBuffer(8),
      coverType: "image/jpeg",
      formats: [],
      cachedAt: Date.now(),
      lastAccessedAt: Date.now(),
      manuallyAdded: true,
    });
    dbV3.close();

    const dbV4 = await openDB<{ offline_books: { key: number; value: { bookId: number; manuallyAdded: boolean } }; reading_progress: { key: number; value: unknown }; reader_settings: { key: string; value: unknown } }>(MIGRATION_DB_NAME, 4, {
      upgrade(_db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 4) {
          const tx = transaction as unknown as IDBPTransaction<Record<string, unknown>, string[], "versionchange">;
          const storeNames = Array.from(tx.objectStoreNames);
          if (storeNames.includes("cached_books")) {
            tx.objectStore("cached_books").name = "offline_books";
          }
        }
      },
    });

    const book = await dbV4.get("offline_books", 7);
    expect(book).toBeTruthy();
    expect(book!.manuallyAdded).toBe(true);
    dbV4.close();
  });
});
