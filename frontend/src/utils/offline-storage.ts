import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "librarium-offline";
const DB_VERSION = 2;

interface CachedBookFormat {
  format: string;
  fileBlob: Blob;
  fileSize: number;
}

// Internal storage uses ArrayBuffer (Safari IndexedDB corrupts Blobs on restart)
interface StoredBookFormat {
  format: string;
  fileBuffer: ArrayBuffer;
  fileType: string;
  fileSize: number;
}

interface StoredBook {
  bookId: number;
  title: string;
  authors: string[];
  coverBuffer: ArrayBuffer;
  coverType: string;
  formats: StoredBookFormat[];
  cachedAt: number;
  lastAccessedAt: number;
  manuallyAdded: boolean;
}

export interface CachedBook {
  bookId: number;
  title: string;
  authors: string[];
  coverBlob: Blob;
  formats: CachedBookFormat[];
  cachedAt: number;
  lastAccessedAt: number;
  manuallyAdded: boolean;
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
  cached_books: { key: number; value: StoredBook };
  reading_progress: { key: number; value: LocalProgress };
  reader_settings: { key: string; value: LocalSettings };
}

type LibrariumDB = IDBPDatabase<LibrariumDBSchema>;

let dbPromise: Promise<LibrariumDB> | null = null;

export function initDB(): Promise<LibrariumDB> {
  if (!dbPromise) {
    dbPromise = openDB<LibrariumDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains("cached_books")) {
          db.createObjectStore("cached_books", { keyPath: "bookId" });
        }
        if (!db.objectStoreNames.contains("reading_progress")) {
          db.createObjectStore("reading_progress", { keyPath: "bookId" });
        }
        if (!db.objectStoreNames.contains("reader_settings")) {
          db.createObjectStore("reader_settings", { keyPath: "deviceType" });
        }
        // v1→v2: Blob→ArrayBuffer — clear old incompatible cached books
        if (oldVersion < 2) {
          transaction.objectStore("cached_books").clear();
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
  meta: { bookId: number; title: string; authors: string[]; manuallyAdded?: boolean },
  files: { format: string; fileBlob: Blob; fileSize: number }[],
  cover: Blob,
): Promise<void> {
  const db = await initDB();
  const now = Date.now();
  // Convert Blobs to ArrayBuffers for Safari compatibility
  const [coverBuffer, ...fileBuffers] = await Promise.all([
    cover.arrayBuffer(),
    ...files.map((f) => f.fileBlob.arrayBuffer()),
  ]);
  await db.put("cached_books", {
    bookId: meta.bookId,
    title: meta.title,
    authors: meta.authors,
    coverBuffer,
    coverType: cover.type || "image/jpeg",
    formats: files.map((f, i) => ({
      format: f.format,
      fileBuffer: fileBuffers[i],
      fileType: f.fileBlob.type || "application/octet-stream",
      fileSize: f.fileSize,
    })),
    cachedAt: now,
    lastAccessedAt: now,
    manuallyAdded: meta.manuallyAdded ?? false,
  });
}

function storedToCachedBook(stored: StoredBook): CachedBook {
  return {
    bookId: stored.bookId,
    title: stored.title,
    authors: stored.authors,
    coverBlob: new Blob([stored.coverBuffer], { type: stored.coverType }),
    formats: stored.formats.map((f: StoredBookFormat) => ({
      format: f.format,
      fileBlob: new Blob([f.fileBuffer], { type: f.fileType }),
      fileSize: f.fileSize,
    })),
    cachedAt: stored.cachedAt,
    lastAccessedAt: stored.lastAccessedAt,
    manuallyAdded: stored.manuallyAdded,
  };
}

export async function getCachedBook(bookId: number): Promise<CachedBook | null> {
  const db = await initDB();
  const stored = await db.get("cached_books", bookId);
  if (!stored) return null;
  return storedToCachedBook(stored);
}

export async function getCachedBooks(): Promise<CachedBook[]> {
  const db = await initDB();
  const all = await db.getAll("cached_books");
  return all.map(storedToCachedBook);
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
    p.lastReadAt = Date.now();
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

export async function getUnsyncedSettings(): Promise<LocalSettings[]> {
  const db = await initDB();
  const all = await db.getAll("reader_settings");
  return all.filter((s) => !s.synced);
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

export async function evictLRU(targetBytes: number = 0): Promise<number[]> {
  const db = await initDB();
  const all = await db.getAll("cached_books");
  if (all.length === 0) return [];
  // Only evict non-manually-added books, sorted by LRU
  const candidates = all.filter((b) => !b.manuallyAdded);
  candidates.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let freed = 0;
  const evicted: number[] = [];
  for (const book of candidates) {
    if (targetBytes > 0 && freed >= targetBytes) break;
    const bookSize = book.formats.reduce((sum: number, f: StoredBookFormat) => sum + f.fileSize, 0) + book.coverBuffer.byteLength;
    await db.delete("cached_books", book.bookId);
    freed += bookSize;
    evicted.push(book.bookId);
    if (targetBytes === 0) break; // evict at least one if no target
  }
  return evicted;
}

// ── Storage usage ──

export async function getStorageUsage(): Promise<{ bookCount: number; totalBytes: number }> {
  const db = await initDB();
  const all = await db.getAll("cached_books");
  let totalBytes = 0;
  for (const book of all) {
    for (const f of book.formats) {
      totalBytes += f.fileSize;
    }
    totalBytes += book.coverBuffer.byteLength;
  }
  return { bookCount: all.length, totalBytes };
}
