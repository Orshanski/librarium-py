import { classifyAuthorRenameForBookList, classifyBookUpdateForBookList } from "@/domain/read-models";
import type { DomainEventMap } from "@/domain/events";
import type { BookListContext } from "@/domain/read-models";

type CacheEntry = {
  value: unknown;
  context?: BookListContext;
};

type Namespace = {
  entries: Map<string, CacheEntry>;
  subscribers: Set<() => void>;
  version: number;
  invalidationVersion: number;
};

const STORAGE_PREFIX = "librarium_metadata_cache_";

export class MetadataCacheStore {
  private namespaces = new Map<string, Namespace>();

  get<T>(namespace: string, key: string): T | undefined {
    return this.getNamespace(namespace).entries.get(key)?.value as T | undefined;
  }

  set(
    namespace: string,
    key: string,
    value: unknown,
    options: { context?: BookListContext } = {},
  ): void {
    const ns = this.getNamespace(namespace);
    ns.entries.set(key, { value, context: options.context });
    ns.version += 1;
    this.persist(namespace);
    this.notify(namespace);
  }

  updateContext(namespace: string, key: string, context: BookListContext | undefined): void {
    const ns = this.getNamespace(namespace);
    const entry = ns.entries.get(key);
    if (!entry || sameContext(entry.context, context)) return;
    ns.entries.set(key, { ...entry, context });
    ns.version += 1;
    this.persist(namespace);
    this.notify(namespace);
  }

  subscribe(namespace: string, handler: () => void): () => void {
    const ns = this.getNamespace(namespace);
    ns.subscribers.add(handler);
    return () => {
      ns.subscribers.delete(handler);
    };
  }

  invalidate(namespace: string): void {
    const ns = this.namespaces.get(namespace);
    if (!ns) {
      sessionStorage.removeItem(STORAGE_PREFIX + namespace);
      return;
    }
    ns.entries.clear();
    ns.version += 1;
    ns.invalidationVersion += 1;
    sessionStorage.removeItem(STORAGE_PREFIX + namespace);
    this.notify(namespace);
  }

  invalidateNamespacePrefix(prefix: string): void {
    for (const namespace of [...this.namespaces.keys()]) {
      if (namespace.startsWith(prefix)) {
        this.invalidate(namespace);
      }
    }
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      const namespace = key?.slice(STORAGE_PREFIX.length);
      if (key?.startsWith(STORAGE_PREFIX) && namespace?.startsWith(prefix)) {
        sessionStorage.removeItem(key);
      }
    }
  }

  patchBookRow(book: { id: number } & Record<string, unknown>): void {
    this.updateBookListEntries((entry) => ({ value: patchBookList(entry.value, book) }));
  }

  applyBookUpdate(payload: DomainEventMap["bookUpdated"]): void {
    this.updateBookListEntries((entry) => {
      if (!entry.context) return { delete: true };
      const decision = classifyBookUpdateForBookList(
        entry.context,
        payload.changedFields,
        payload.affected,
      );
      if (decision === "structural") return { delete: true };
      return { value: patchBookList(entry.value, payload.book) };
    });
  }

  applyAuthorRename(payload: DomainEventMap["authorRenamed"]): void {
    this.updateBookListEntries((entry) => {
      if (!entry.context) return { delete: true };
      if (classifyAuthorRenameForBookList(entry.context) === "structural") {
        return { delete: true };
      }
      return {
        value: {
          ...entry.value,
          books: entry.value.books.map((row) => patchAuthorRefs(row, payload)),
        },
      };
    });
  }

  applySeriesRename(payload: DomainEventMap["seriesRenamed"]): void {
    this.updateBookListEntries((entry) => {
      if (!entry.context || entry.context.source === "search") return { delete: true };
      return {
        value: {
          ...entry.value,
          books: entry.value.books.map((row) => patchSeriesRef(row, payload)),
        },
      };
    });
  }

  invalidateBookLists(): void {
    this.updateBookListEntries(() => ({ delete: true }));
  }

  patchBookRowsWhere(
    predicate: (row: BookListRow) => boolean,
    patcher: (row: BookListRow) => BookListRow,
  ): void {
    this.updateBookListEntries((entry) => ({
      value: {
        ...entry.value,
        books: entry.value.books.map((row) => (predicate(row) ? patcher(row) : row)),
      },
    }));
  }

  clear(): void {
    this.hydratePersistedNamespaces();
    const affectedNamespaces = new Set(this.namespaces.keys());
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        sessionStorage.removeItem(key);
        affectedNamespaces.add(key.slice(STORAGE_PREFIX.length));
      }
    }
    for (const namespace of affectedNamespaces) {
      const ns = this.getNamespace(namespace);
      ns.entries.clear();
      ns.version += 1;
      ns.invalidationVersion += 1;
      this.notify(namespace);
    }
  }

  version(namespace: string): number {
    return this.getNamespace(namespace).version;
  }

  invalidationVersion(namespace: string): number {
    return this.getNamespace(namespace).invalidationVersion;
  }

  private getNamespace(namespace: string): Namespace {
    const existing = this.namespaces.get(namespace);
    if (existing) return existing;
    const created: Namespace = {
      entries: readPersistedNamespace(namespace),
      subscribers: new Set<() => void>(),
      version: 0,
      invalidationVersion: 0,
    };
    this.namespaces.set(namespace, created);
    return created;
  }

  private updateBookListEntries(
    updater: (entry: CacheEntry & { value: BookListValue }) => { value?: BookListValue; delete?: boolean },
  ): void {
    this.hydratePersistedNamespaces();
    for (const [namespace, ns] of this.namespaces) {
      let changed = false;
      let invalidated = false;
      for (const [key, entry] of [...ns.entries]) {
        if (!isBookList(entry.value)) continue;
        const result = updater(entry as CacheEntry & { value: BookListValue });
        if (result.delete) {
          ns.entries.delete(key);
          changed = true;
          invalidated = true;
        } else if (result.value) {
          ns.entries.set(key, { ...entry, value: result.value });
          changed = true;
        }
      }
      if (changed) {
        ns.version += 1;
        if (invalidated) {
          ns.invalidationVersion += 1;
        }
        this.persist(namespace);
        this.notify(namespace);
      }
    }
  }

  private hydratePersistedNamespaces(): void {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      this.getNamespace(key.slice(STORAGE_PREFIX.length));
    }
  }

  private notify(namespace: string): void {
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    for (const handler of [...ns.subscribers]) {
      handler();
    }
  }

  private persist(namespace: string): void {
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    sessionStorage.setItem(STORAGE_PREFIX + namespace, JSON.stringify(Object.fromEntries(ns.entries)));
  }
}

type BookListRow = { id: number } & Record<string, unknown>;
type BookListValue = { books: BookListRow[] } & Record<string, unknown>;

function isBookList(value: unknown): value is BookListValue {
  return typeof value === "object"
    && value !== null
    && Array.isArray((value as { books?: unknown }).books)
    && (value as { books: unknown[] }).books.every(isBookListRow);
}

function sameContext(left: BookListContext | undefined, right: BookListContext | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function patchBookList(value: BookListValue, book: { id: number } & Record<string, unknown>): BookListValue {
  return {
    ...value,
    books: value.books.map((row) => (row.id === book.id ? { ...row, ...book } : row)),
  };
}

function patchAuthorRefs(
  row: BookListRow,
  payload: DomainEventMap["authorRenamed"],
): BookListRow {
  if (!Array.isArray(row.authors)) return row;
  return {
    ...row,
    authors: row.authors.map((author) => (
      isAuthorRef(author) && author.id === payload.authorId
        ? { ...author, name: payload.name, ...(payload.sortName !== undefined ? { sortName: payload.sortName } : {}) }
        : author
    )),
  };
}

function patchSeriesRef(
  row: BookListRow,
  payload: DomainEventMap["seriesRenamed"],
): BookListRow {
  if (!isRefWithId(row.series, payload.seriesId)) return row;
  return {
    ...row,
    series: {
      ...row.series,
      name: payload.name,
      ...(payload.sortName !== undefined ? { sortName: payload.sortName } : {}),
    },
  };
}

function isAuthorRef(value: unknown): value is { id: number; name: string; sortName?: string } {
  return typeof value === "object"
    && value !== null
    && typeof (value as { id?: unknown }).id === "number";
}

function isRefWithId(value: unknown, id: number): value is { id: number; name?: string; sortName?: string } {
  return typeof value === "object"
    && value !== null
    && (value as { id?: unknown }).id === id;
}

function isBookListRow(value: unknown): value is BookListRow {
  return typeof value === "object"
    && value !== null
    && typeof (value as { id?: unknown }).id === "number";
}

function readPersistedNamespace(namespace: string): Map<string, CacheEntry> {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + namespace);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Map();
    }
    return new Map(
      Object.entries(parsed as Record<string, unknown>)
        .flatMap(([key, entry]) => {
          const normalized = normalizePersistedEntry(entry);
          return normalized ? [[key, normalized] as const] : [];
        }),
    );
  } catch {
    return new Map();
  }
}

function normalizePersistedEntry(entry: unknown): CacheEntry | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  if (!("value" in entry)) return undefined;
  const value = (entry as { value: unknown }).value;
  const context = (entry as { context?: unknown }).context;
  if (hasBooksArray(value) && !isBookList(value)) return undefined;
  return {
    value,
    context: isBookListContext(context) ? context : undefined,
  };
}

function hasBooksArray(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && Array.isArray((value as { books?: unknown }).books);
}

const BOOK_LIST_SOURCES = new Set([
  "catalog",
  "tag-detail",
  "author-detail",
  "series-detail",
  "shelf-regular",
  "shelf-best",
  "shelf-reading-now",
  "search",
]);

const BOOK_LIST_SORTS = new Set([
  "addedDesc",
  "addedAsc",
  "titleAsc",
  "titleDesc",
  "authorAsc",
  "authorDesc",
  "ratingDesc",
  "ratingAsc",
  "seriesNumber",
  "lastReadDesc",
]);

function isBookListContext(value: unknown): value is BookListContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  if (!(context.kind === "book-list"
    && typeof context.key === "string"
    && typeof context.source === "string"
    && BOOK_LIST_SOURCES.has(context.source)
    && typeof context.sort === "string"
    && BOOK_LIST_SORTS.has(context.sort))) {
    return false;
  }
  if (!isOptionalNumber(context.authorId)) return false;
  if (!isOptionalNumber(context.seriesId)) return false;
  if (!isOptionalNumber(context.tagId)) return false;
  if (!isOptionalNumber(context.shelfId)) return false;
  if (context.query !== undefined && typeof context.query !== "string") return false;
  if (!isFilters(context.filters)) return false;
  if (context.source !== "author-detail" && context.authorId !== undefined) return false;
  if (context.source !== "series-detail" && context.seriesId !== undefined) return false;
  if (context.source !== "tag-detail" && context.tagId !== undefined) return false;
  if (
    context.source !== "shelf-regular"
    && context.source !== "shelf-best"
    && context.source !== "shelf-reading-now"
    && context.shelfId !== undefined
  ) {
    return false;
  }
  if (context.source === "author-detail" && typeof context.authorId !== "number") return false;
  if (context.source === "series-detail" && typeof context.seriesId !== "number") return false;
  if (context.source === "tag-detail" && typeof context.tagId !== "number") return false;
  if (
    (context.source === "shelf-regular" || context.source === "shelf-best" || context.source === "shelf-reading-now")
    && typeof context.shelfId !== "number"
  ) {
    return false;
  }
  return true;
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

function isFilters(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const filters = value as Record<string, unknown>;
  return isOptionalNumberArray(filters.authorIds)
    && isOptionalNumberArray(filters.seriesIds)
    && isOptionalNumberArray(filters.tagIds)
    && isOptionalStringArray(filters.languages);
}

function isOptionalNumberArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "number"));
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}
