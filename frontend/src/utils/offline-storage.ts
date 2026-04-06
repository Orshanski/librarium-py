import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "librarium-offline";
const DB_VERSION = 1;

interface CachedBookFormat {
  format: string;
  fileBlob: Blob;
  fileSize: number;
}

export interface CachedBook {
  bookId: number;
  title: string;
  authors: string[];
  coverBlob: Blob;
  formats: CachedBookFormat[];
  cachedAt: number;
  lastAccessedAt: number;
}

export interface LocalProgress {
  bookId: number;
  position: string;
  fraction: number;
  lastFormat: string;
  lastReadAt: number;
  synced: boolean;
}

export interface LocalSettings {
  deviceType: string;
  settings: Record<string, unknown>;
  updatedAt: number;
  synced: boolean;
}

interface LibrariumDBSchema {
  cached_books: { key: number; value: CachedBook };
  reading_progress: { key: number; value: LocalProgress };
  reader_settings: { key: string; value: LocalSettings };
}

type LibrariumDB = IDBPDatabase<LibrariumDBSchema>;

let dbPromise: Promise<LibrariumDB> | null = null;

export function initDB(): Promise<LibrariumDB> {
  if (!dbPromise) {
    dbPromise = openDB<LibrariumDBSchema>(DB_NAME, DB_VERSION, {
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
  }
  return dbPromise;
}

/** Clear all stores and reset — for tests only. */
export async function _resetDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    const tx = db.transaction(["cached_books", "reading_progress", "reader_settings"], "readwrite");
    await Promise.all([
      tx.objectStore("cached_books").clear(),
      tx.objectStore("reading_progress").clear(),
      tx.objectStore("reader_settings").clear(),
      tx.done,
    ]);
  }
  dbPromise = null;
}

// ── Book cache ──

export async function cacheBook(
  meta: { bookId: number; title: string; authors: string[] },
  files: { format: string; fileBlob: Blob; fileSize: number }[],
  cover: Blob,
): Promise<void> {
  const db = await initDB();
  const now = Date.now();
  await db.put("cached_books", {
    bookId: meta.bookId,
    title: meta.title,
    authors: meta.authors,
    coverBlob: cover,
    formats: files,
    cachedAt: now,
    lastAccessedAt: now,
  });
}

export async function getCachedBook(bookId: number): Promise<CachedBook | null> {
  const db = await initDB();
  return (await db.get("cached_books", bookId)) ?? null;
}

export async function getCachedBooks(): Promise<CachedBook[]> {
  const db = await initDB();
  return db.getAll("cached_books");
}

export async function isCached(bookId: number): Promise<boolean> {
  const db = await initDB();
  const key = await db.getKey("cached_books", bookId);
  return key !== undefined;
}

export async function removeCachedBook(bookId: number): Promise<void> {
  const db = await initDB();
  await db.delete("cached_books", bookId);
}

export async function touchBook(bookId: number): Promise<void> {
  const db = await initDB();
  const book = await db.get("cached_books", bookId);
  if (book) {
    book.lastAccessedAt = Date.now();
    await db.put("cached_books", book);
  }
}

// ── Reading progress ──

export async function saveProgress(
  bookId: number,
  data: { position: string; fraction: number; lastFormat: string; lastReadAt: number },
): Promise<void> {
  const db = await initDB();
  await db.put("reading_progress", { bookId, ...data, synced: false });
}

export async function getProgress(bookId: number): Promise<LocalProgress | null> {
  const db = await initDB();
  return (await db.get("reading_progress", bookId)) ?? null;
}

export async function getUnsyncedProgress(): Promise<LocalProgress[]> {
  const db = await initDB();
  const all = await db.getAll("reading_progress");
  return all.filter((p) => !p.synced);
}

export async function markProgressSynced(bookId: number): Promise<void> {
  const db = await initDB();
  const p = await db.get("reading_progress", bookId);
  if (p) {
    p.synced = true;
    await db.put("reading_progress", p);
  }
}

// ── Reader settings ──

export async function saveSettings(
  deviceType: string,
  settings: Record<string, unknown>,
): Promise<void> {
  const db = await initDB();
  await db.put("reader_settings", {
    deviceType,
    settings,
    updatedAt: Date.now(),
    synced: false,
  });
}

export async function getSettings(deviceType: string): Promise<LocalSettings | null> {
  const db = await initDB();
  return (await db.get("reader_settings", deviceType)) ?? null;
}

export async function markSettingsSynced(deviceType: string): Promise<void> {
  const db = await initDB();
  const s = await db.get("reader_settings", deviceType);
  if (s) {
    s.synced = true;
    await db.put("reader_settings", s);
  }
}

// ── Eviction ──

const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function evictExpired(ttlMs: number = TTL_MS): Promise<number> {
  const db = await initDB();
  const all = await db.getAll("cached_books");
  const cutoff = Date.now() - ttlMs;
  let count = 0;
  for (const book of all) {
    if (book.lastAccessedAt < cutoff) {
      await db.delete("cached_books", book.bookId);
      count++;
    }
  }
  return count;
}

export async function evictLRU(): Promise<number | null> {
  const db = await initDB();
  const all = await db.getAll("cached_books");
  if (all.length === 0) return null;
  all.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  const oldest = all[0];
  await db.delete("cached_books", oldest.bookId);
  return oldest.bookId;
}
