import { openDB, type IDBPDatabase, type IDBPTransaction, type DBSchema } from "idb";
import type { AuthorRef, Book, SeriesRef } from "../types";

const DB_NAME = "librarium-offline";
const DB_VERSION = 5;

interface OfflineBookFormat {
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

/**
 * On-disk shape. Honest about reality: legacy v4 rows have `authors: string[]`
 * and no card-level fields (`series`, `seriesNumber`, `rating`, `isRead`).
 * Writer (`saveOfflineBook`) always writes the full v5 shape; reader
 * (`storedToOfflineBook`) normalizes legacy → unified `OfflineBook`.
 */
interface StoredBook {
  bookId: number;
  title: string;
  authors: AuthorRef[] | string[];
  coverBuffer: ArrayBuffer;
  coverType: string;
  formats: StoredBookFormat[];
  savedAt: number;
  lastAccessedAt: number;
  manuallyAdded: boolean;
  series?: SeriesRef | null;
  seriesNumber?: number | null;
  rating?: number | null;
  isRead?: boolean;
}

export interface OfflineBook {
  bookId: number;
  title: string;
  authors: AuthorRef[];
  series: SeriesRef | null;
  seriesNumber: number | null;
  rating: number | null;
  isRead: boolean;
  coverBlob: Blob;
  formats: OfflineBookFormat[];
  savedAt: number;
  lastAccessedAt: number;
  manuallyAdded: boolean;
}

export interface LocalProgress {
  bookId: number;
  position: string;
  fraction: number;
  lastFormat: string;
  lastReadAt: number;
  serverVersion: number;
  synced: boolean;
}

export interface LocalSettings {
  deviceType: string;
  settings: Record<string, unknown>;
  updatedAt: number;
  synced: boolean;
}

// Legacy schema for upgrade path (v3 → v4 rename). Used via cast inside upgrade().
interface LibrariumDBSchemaV3 extends DBSchema {
  cached_books: { key: number; value: StoredBook };
  reading_progress: { key: number; value: LocalProgress };
  reader_settings: { key: string; value: LocalSettings };
}

interface LibrariumDBSchema extends DBSchema {
  offline_books: { key: number; value: StoredBook };
  reading_progress: { key: number; value: LocalProgress };
  reader_settings: { key: string; value: LocalSettings };
}

type LibrariumDB = IDBPDatabase<LibrariumDBSchema>;

let dbPromise: Promise<LibrariumDB> | null = null;

export function initDB(): Promise<LibrariumDB> {
  if (!dbPromise) {
    dbPromise = openDB<LibrariumDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // Cast для доступа к legacy-store "cached_books" при миграции v3→v4.
        // Документированный паттерн idb: https://github.com/jakearchibald/idb#typescript
        type V3StoreNames = ("cached_books" | "reading_progress" | "reader_settings")[];
        const v3Db = db as unknown as IDBPDatabase<LibrariumDBSchemaV3>;
        const v3Tx = transaction as unknown as IDBPTransaction<LibrariumDBSchemaV3, V3StoreNames, "versionchange">;

        // Fresh install (oldVersion === 0): создаём сразу под новым именем.
        if (oldVersion === 0) {
          db.createObjectStore("offline_books", { keyPath: "bookId" });
          db.createObjectStore("reading_progress", { keyPath: "bookId" });
          db.createObjectStore("reader_settings", { keyPath: "deviceType" });
          return;
        }

        // Upgrade от существующей установки. Legacy-store называется "cached_books" до v4.
        if (!v3Db.objectStoreNames.contains("reading_progress")) {
          db.createObjectStore("reading_progress", { keyPath: "bookId" });
        }
        if (!v3Db.objectStoreNames.contains("reader_settings")) {
          db.createObjectStore("reader_settings", { keyPath: "deviceType" });
        }

        // v1→v2: Blob→ArrayBuffer — сбрасываем несовместимые offline-книги.
        if (oldVersion < 2 && v3Db.objectStoreNames.contains("cached_books")) {
          v3Tx.objectStore("cached_books").clear();
        }

        // v2→v3: локальные записи reading_progress без поля serverVersion
        // несовместимы с CAS-sync в схеме v3+ — сбрасываем.
        if (oldVersion < 3 && v3Db.objectStoreNames.contains("reading_progress")) {
          transaction.objectStore("reading_progress").clear();
        }

        // v3→v4: native rename cached_books → offline_books через setter
        // IDBObjectStore.name внутри versionchange-транзакции (стандартный
        // IndexedDB API). Данные сохраняются атомарно, копирование не требуется.
        if (oldVersion < 4 && v3Db.objectStoreNames.contains("cached_books")) {
          v3Tx.objectStore("cached_books").name = "offline_books";
        }

        // v4→v5: extended StoredBook with card-level fields (series,
        // seriesNumber, rating, isRead) and switched authors from string[] to
        // AuthorRef[]. No store-level schema rewrite needed — IndexedDB doesn't
        // enforce row shape; storedToOfflineBook() normalizes legacy rows on
        // read (string[] → AuthorRef[] with synthetic id=0; missing fields →
        // null/false).
      },
    });
  }
  return dbPromise;
}

/** Clear all stores and reset — for tests only. */
export async function _resetDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    const tx = db.transaction(["offline_books", "reading_progress", "reader_settings"], "readwrite");
    await Promise.all([
      tx.objectStore("offline_books").clear(),
      tx.objectStore("reading_progress").clear(),
      tx.objectStore("reader_settings").clear(),
      tx.done,
    ]);
    // Close the underlying connection so callers that need a fresh open
    // (e.g. an in-test deleteDB or upgrade-path simulation) aren't blocked.
    db.close();
  }
  dbPromise = null;
}

// ── Offline book storage ──

/**
 * Legacy v4 rows store authors as `string[]`; v5+ stores `AuthorRef[]`. On
 * read, normalize to `AuthorRef[]`. For legacy strings we synthesize `id: 0`
 * (acceptable per spec — author links become non-clickable until the book is
 * re-downloaded with the new server payload).
 */
function normalizeAuthors(input: AuthorRef[] | string[] | undefined): AuthorRef[] {
  if (!input) return [];
  return input.map((item) => {
    if (typeof item === "string") return { id: 0, name: item };
    return item;
  });
}

export async function saveOfflineBook(
  book: Book,
  files: { format: string; fileBlob: Blob; fileSize: number }[],
  cover: Blob,
  manuallyAdded = false,
): Promise<void> {
  const db = await initDB();
  const now = Date.now();
  // Convert Blobs to ArrayBuffers for Safari compatibility
  const [coverBuffer, ...fileBuffers] = await Promise.all([
    cover.arrayBuffer(),
    ...files.map((f) => f.fileBlob.arrayBuffer()),
  ]);
  await db.put("offline_books", {
    bookId: book.id,
    title: book.title,
    authors: book.authors,
    series: book.series,
    seriesNumber: book.seriesNumber,
    rating: book.rating,
    isRead: book.isRead,
    coverBuffer,
    coverType: cover.type || "image/jpeg",
    formats: files.map((f, i) => ({
      format: f.format,
      fileBuffer: fileBuffers[i],
      fileType: f.fileBlob.type || "application/octet-stream",
      fileSize: f.fileSize,
    })),
    savedAt: now,
    lastAccessedAt: now,
    manuallyAdded,
  });
}

function storedToOfflineBook(stored: StoredBook): OfflineBook {
  return {
    bookId: stored.bookId,
    title: stored.title,
    authors: normalizeAuthors(stored.authors),
    series: stored.series ?? null,
    seriesNumber: stored.seriesNumber ?? null,
    rating: stored.rating ?? null,
    isRead: stored.isRead ?? false,
    coverBlob: new Blob([stored.coverBuffer], { type: stored.coverType }),
    formats: stored.formats.map((f: StoredBookFormat) => ({
      format: f.format,
      fileBlob: new Blob([f.fileBuffer], { type: f.fileType }),
      fileSize: f.fileSize,
    })),
    savedAt: stored.savedAt,
    lastAccessedAt: stored.lastAccessedAt,
    manuallyAdded: stored.manuallyAdded,
  };
}

export async function getOfflineBook(bookId: number): Promise<OfflineBook | null> {
  const db = await initDB();
  const stored = await db.get("offline_books", bookId);
  if (!stored) return null;
  return storedToOfflineBook(stored);
}

export async function getOfflineBooks(): Promise<OfflineBook[]> {
  const db = await initDB();
  const all = await db.getAll("offline_books");
  return all.map(storedToOfflineBook);
}

export async function hasOfflineBook(bookId: number): Promise<boolean> {
  const db = await initDB();
  const key = await db.getKey("offline_books", bookId);
  return key !== undefined;
}

export async function removeOfflineBook(bookId: number): Promise<void> {
  const db = await initDB();
  await db.delete("offline_books", bookId);
}

/**
 * Remove all local traces of a book — offline blob + reading progress.
 * Used when the book is deleted on the server to keep client state consistent.
 * Idempotent: no-op if stores don't contain the book.
 */
export async function removeBookFromLocalStorage(bookId: number): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(["offline_books", "reading_progress"], "readwrite");
  await Promise.all([
    tx.objectStore("offline_books").delete(bookId),
    tx.objectStore("reading_progress").delete(bookId),
    tx.done,
  ]);
}

/**
 * Update only card-level metadata (title, authors, series, seriesNumber,
 * rating, isRead) of a stored offline book. Binary fields (coverBuffer,
 * coverType, formats), timestamps (savedAt, lastAccessedAt) and the
 * manuallyAdded flag are preserved. No-op if the book is not stored.
 */
export async function updateOfflineBookMetadata(
  bookId: number,
  metadata: Pick<Book, "title" | "authors" | "series" | "seriesNumber" | "rating" | "isRead">,
): Promise<void> {
  const db = await initDB();
  const tx = db.transaction("offline_books", "readwrite");
  const store = tx.objectStore("offline_books");
  const existing = await store.get(bookId);
  if (!existing) {
    await tx.done;
    return;
  }
  existing.title = metadata.title;
  existing.authors = metadata.authors;
  existing.series = metadata.series;
  existing.seriesNumber = metadata.seriesNumber;
  existing.rating = metadata.rating;
  existing.isRead = metadata.isRead;
  await store.put(existing);
  await tx.done;
}

export async function touchOfflineBook(bookId: number): Promise<void> {
  const db = await initDB();
  const book = await db.get("offline_books", bookId);
  if (book) {
    book.lastAccessedAt = Date.now();
    await db.put("offline_books", book);
  }
}

// ── Reading progress ──

export async function saveProgress(
  bookId: number,
  data: {
    position: string;
    fraction: number;
    lastFormat: string;
    lastReadAt: number;
    serverVersion?: number;
  },
): Promise<void> {
  // Single readwrite transaction so the get and put are atomic — otherwise
  // a concurrent saveProgress call could interleave between them.
  const db = await initDB();
  const tx = db.transaction("reading_progress", "readwrite");
  const store = tx.objectStore("reading_progress");
  const existing = await store.get(bookId);
  await store.put({
    bookId,
    ...data,
    // Preserve existing serverVersion across local-only writes
    // (handleRelocate doesn't know/care). Explicit versions are used for
    // server-sourced writes such as adopt; accepted push acknowledgements use
    // reconcileAcceptedProgress so newer local state is not overwritten.
    serverVersion: data.serverVersion ?? existing?.serverVersion ?? 0,
    synced: false,
  });
  await tx.done;
}

export async function getProgress(bookId: number): Promise<LocalProgress | null> {
  const db = await initDB();
  return (await db.get("reading_progress", bookId)) ?? null;
}

function isSameProgressSnapshot(current: LocalProgress, sent: LocalProgress): boolean {
  return current.bookId === sent.bookId
    && current.position === sent.position
    && current.fraction === sent.fraction
    && current.lastFormat === sent.lastFormat
    && current.lastReadAt === sent.lastReadAt
    && current.serverVersion === sent.serverVersion;
}

export async function reconcileAcceptedProgress(
  sent: LocalProgress,
  serverVersion: number,
): Promise<void> {
  const db = await initDB();
  const tx = db.transaction("reading_progress", "readwrite");
  const store = tx.objectStore("reading_progress");
  const current = await store.get(sent.bookId);
  if (!current || current.serverVersion > serverVersion) {
    await tx.done;
    return;
  }

  const matchesSent = isSameProgressSnapshot(current, sent);
  current.serverVersion = serverVersion;
  current.synced = matchesSent;
  await store.put(current);
  await tx.done;
}

export async function removeProgress(bookId: number): Promise<void> {
  const db = await initDB();
  await db.delete("reading_progress", bookId);
}

export async function getUnsyncedProgress(): Promise<LocalProgress[]> {
  const db = await initDB();
  const all = await db.getAll("reading_progress");
  return all.filter((p) => !p.synced);
}

/**
 * Write a server-sourced reading_progress state into IDB and mark it synced.
 * Used by both the CAS helper (on reject-adopt) and useReaderPosition's
 * adoptServerProgress (on mount/resume sync) so the shape is consistent.
 */
export async function adoptServerProgressLocal(
  bookId: number,
  server: {
    position: string;
    fraction?: number | null;
    lastFormat?: string | null;
    lastReadAt?: string | null;
    version?: number;
  },
  fallbackLastFormat: string,
): Promise<void> {
  await saveProgress(bookId, {
    position: server.position,
    fraction: server.fraction ?? 0,
    lastFormat: server.lastFormat ?? fallbackLastFormat,
    lastReadAt: server.lastReadAt
      ? new Date(server.lastReadAt).getTime()
      : Date.now(),
    serverVersion: server.version ?? 0,
  });
  await markProgressSynced(bookId);
}

export async function markProgressSynced(bookId: number): Promise<void> {
  const db = await initDB();
  const tx = db.transaction("reading_progress", "readwrite");
  const store = tx.objectStore("reading_progress");
  const p = await store.get(bookId);
  if (p) {
    p.synced = true;
    await store.put(p);
  }
  await tx.done;
}

export async function getLastReadBook(): Promise<{ bookId: number; lastFormat: string } | null> {
  const db = await initDB();
  const all = await db.getAll("reading_progress");
  if (all.length === 0) return null;
  let latest = all[0];
  for (const p of all) {
    if (p.lastReadAt > latest.lastReadAt) latest = p;
  }
  if (!latest.lastFormat) return null;
  return { bookId: latest.bookId, lastFormat: latest.lastFormat };
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
  const all = await db.getAll("offline_books");
  const cutoff = Date.now() - ttlMs;
  let count = 0;
  for (const book of all) {
    if (book.lastAccessedAt < cutoff) {
      await db.delete("offline_books", book.bookId);
      count++;
    }
  }
  return count;
}

export async function evictLRU(targetBytes: number = 0): Promise<number[]> {
  const db = await initDB();
  const all = await db.getAll("offline_books");
  if (all.length === 0) return [];
  // Only evict non-manually-added books, sorted by LRU
  const candidates = all.filter((b) => !b.manuallyAdded);
  candidates.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let freed = 0;
  const evicted: number[] = [];
  for (const book of candidates) {
    if (targetBytes > 0 && freed >= targetBytes) break;
    const bookSize = book.formats.reduce((sum: number, f: StoredBookFormat) => sum + f.fileSize, 0) + book.coverBuffer.byteLength;
    await db.delete("offline_books", book.bookId);
    freed += bookSize;
    evicted.push(book.bookId);
    if (targetBytes === 0) break; // evict at least one if no target
  }
  return evicted;
}

// ── Storage usage ──

export async function getStorageUsage(): Promise<{ bookCount: number; totalBytes: number }> {
  const db = await initDB();
  const all = await db.getAll("offline_books");
  let totalBytes = 0;
  for (const book of all) {
    for (const f of book.formats) {
      totalBytes += f.fileSize;
    }
    totalBytes += book.coverBuffer.byteLength;
  }
  return { bookCount: all.length, totalBytes };
}
