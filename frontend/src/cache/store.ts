import { classifyAuthorRenameForBookList, classifyBookUpdateForBookList, classifySeriesRenameForBookList, classifyTagRenameForBookList } from "@/domain/read-models";
import type { DomainEventMap } from "@/domain/events";
import type { BookListContext } from "@/domain/read-models";
import { patchBookDetailBook } from "./projection/book-detail";
import { isRecord } from "./projection/guards";
import { patchNamedRefs } from "./projection/refs";
import { mergeRowById } from "./projection/rows";
import { sortByName, sortBySortName } from "./projection/sorts";

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
  private readonly namespaces = new Map<string, Namespace>();

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
    for (const namespace of this.namespaces.keys()) {
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
    const sortName = payload.sortName ?? deriveAuthorSortName(payload.name);
    const sortNamePatchValue = { sortName };
    this.updateBookListEntries((entry) => {
      if (!entry.context) return { delete: true };
      if (classifyAuthorRenameForBookList(entry.context) === "structural") {
        return { delete: true };
      }
      return {
        value: {
          ...entry.value,
          books: entry.value.books.map((row) => patchAuthorRefs(row, payload, sortName)),
        },
      };
    });

    this.updateNamespacePrefixEntries("book/", (_namespace, entry) => ({
      ...entry,
      value: patchBookDetailBook(entry.value, (book) => {
        const authors = Array.isArray(book.authors)
          ? patchNamedRefs(
            book.authors as Array<{ id: number; name: string; sortName?: string }>,
            payload.authorId,
            { name: payload.name, ...sortNamePatchValue },
          ).refs
          : book.authors;

        return { ...book, authors };
      }),
    }));

    this.patchRowListNamespace<{ id: number; name: string; sortName?: string }>(
      "authors",
      "authors",
      payload.authorId,
      { name: payload.name, ...sortNamePatchValue },
      sortBySortName,
      (rows) => rows.every(isValidSortNameRow),
    );

    this.patchArrayNamespace<{ id: number; name: string }>(
      "filter-options/authors",
      payload.authorId,
      { name: payload.name },
      sortByName,
      (rows) => rows.every(isValidNameRow),
    );
    this.patchRowListNamespace<{ id: number; name: string }>(
      "filter-options/authors",
      "authors",
      payload.authorId,
      { name: payload.name },
      sortByName,
      (rows) => rows.every(isValidNameRow),
    );

    this.patchNestedRefsInNamespace(
      "series",
      "series",
      "authors",
      payload.authorId,
      { name: payload.name, ...sortNamePatchValue },
    );

    this.hydratePersistedNamespaces();
    const namespace = `author/${payload.authorId}`;
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    let changed = false;
    // invariant: namespace ⇒ entity-id binding
    // namespace author/{id} гарантирует принадлежность записи именно этому автору —
    // проверка author.id === payload.authorId избыточна (та же гарантия, что в applyShelfRename).
    for (const [key, entry] of ns.entries) {
      const value = entry.value as { author?: { name?: unknown; sortName?: unknown } } & Record<string, unknown>;
      const author = value.author;
      if (author) {
        ns.entries.set(key, {
          ...entry,
          value: {
            ...value,
            author: { ...author, name: payload.name, ...sortNamePatchValue },
          },
        });
        changed = true;
      }
    }
    if (changed) {
      ns.version += 1;
      this.persist(namespace);
      this.notify(namespace);
    }
  }

  applySeriesRename(payload: DomainEventMap["seriesRenamed"]): void {
    const sortName = payload.sortName ?? payload.name;
    const sortNamePatchValue = { sortName };
    this.updateBookListEntries((entry) => {
      if (!entry.context) return { delete: true };
      if (classifySeriesRenameForBookList(entry.context) === "structural") {
        return { delete: true };
      }
      return {
        value: {
          ...entry.value,
          books: entry.value.books.map((row) => patchSeriesRef(row, payload, sortName)),
        },
      };
    });

    this.updateNamespacePrefixEntries("book/", (_namespace, entry) => ({
      ...entry,
      value: patchBookDetailBook(entry.value, (book) => {
        const series = hasNumericId(book.series) && book.series.id === payload.seriesId
          ? {
            ...book.series,
            name: payload.name,
            ...sortNamePatchValue,
          }
          : book.series;

        return { ...book, series };
      }),
    }));

    this.patchRowListNamespace<{ id: number; name: string; sortName?: string }>(
      "series",
      "series",
      payload.seriesId,
      { name: payload.name, ...sortNamePatchValue },
      sortBySortName,
      (rows) => rows.every(isValidSortNameRow),
    );

    this.patchArrayNamespace<{ id: number; name: string }>(
      "filter-options/series",
      payload.seriesId,
      { name: payload.name },
      sortByName,
      (rows) => rows.every(isValidNameRow),
    );
    this.patchRowListNamespace<{ id: number; name: string }>(
      "filter-options/series",
      "series",
      payload.seriesId,
      { name: payload.name },
      sortByName,
      (rows) => rows.every(isValidNameRow),
    );

    this.hydratePersistedNamespaces();
    const namespace = `series/${payload.seriesId}`;
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    let changed = false;
    // invariant: namespace ⇒ entity-id binding
    // namespace series/{id} гарантирует принадлежность записи именно этой серии —
    // проверка series.id === payload.seriesId избыточна (тот же приём, что в applyAuthorRename).
    for (const [key, entry] of ns.entries) {
      const value = entry.value as { series?: { name?: unknown; sortName?: unknown } } & Record<string, unknown>;
      const series = value.series;
      if (series) {
        ns.entries.set(key, {
          ...entry,
          value: {
            ...value,
            series: { ...series, name: payload.name, ...sortNamePatchValue },
          },
        });
        changed = true;
      }
    }
    if (changed) {
      ns.version += 1;
      this.persist(namespace);
      this.notify(namespace);
    }
  }

  applyTagRename(payload: DomainEventMap["tagRenamed"]): void {
    this.updateBookListEntries((entry) => {
      if (!entry.context) return { delete: true };
      if (classifyTagRenameForBookList(entry.context) === "structural") {
        return { delete: true };
      }
      return {
        value: {
          ...entry.value,
          books: entry.value.books.map((row) => patchTagRefs(row, payload)),
        },
      };
    });

    this.updateNamespacePrefixEntries("book/", (_namespace, entry) => ({
      ...entry,
      value: patchBookDetailBook(entry.value, (book) => {
        const tags = Array.isArray(book.tags)
          ? patchNamedRefs(
            book.tags as Array<{ id: number; name: string }>,
            payload.tagId,
            { name: payload.name },
          ).refs
          : book.tags;

        return { ...book, tags };
      }),
    }));

    this.patchRowListNamespace<{ id: number; name: string }>(
      "tags",
      "tags",
      payload.tagId,
      { name: payload.name },
      (rows, key) => (key === "cloud?top=30" ? rows : sortByName(rows)),
      (rows) => rows.every(isValidNameRow),
    );

    this.patchArrayNamespace<{ id: number; name: string }>(
      "filter-options/tags",
      payload.tagId,
      { name: payload.name },
      sortByName,
      (rows) => rows.every(isValidNameRow),
    );
    this.patchRowListNamespace<{ id: number; name: string }>(
      "filter-options/tags",
      "tags",
      payload.tagId,
      { name: payload.name },
      sortByName,
      (rows) => rows.every(isValidNameRow),
    );

    this.patchNestedRefsInNamespace(
      "authors",
      "authors",
      "tags",
      payload.tagId,
      { name: payload.name },
    );

    this.hydratePersistedNamespaces();
    const namespace = `tag/${payload.tagId}`;
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    let changed = false;
    // invariant: namespace ⇒ entity-id binding
    // namespace tag/{id} гарантирует принадлежность записи именно этому тегу —
    // проверка tag.id === payload.tagId избыточна (тот же приём, что в applySeriesRename).
    for (const [key, entry] of ns.entries) {
      const value = entry.value as { tag?: { name?: unknown } } & Record<string, unknown>;
      const tag = value.tag;
      if (tag) {
        ns.entries.set(key, {
          ...entry,
          value: {
            ...value,
            tag: { ...tag, name: payload.name },
          },
        });
        changed = true;
      }
    }
    if (changed) {
      ns.version += 1;
      this.persist(namespace);
      this.notify(namespace);
    }
  }

  applyShelfMembershipChange(payload: DomainEventMap["shelfMembershipChanged"]): void {
    const { shelfId, bookId, hasBook, book } = payload;
    this.hydratePersistedNamespaces();
    const namespace = `shelf/${shelfId}`;
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    let changed = false;
    let invalidated = false;
    const keysToDelete: string[] = [];
    for (const [key, entry] of ns.entries) {
      const value = entry.value as Record<string, unknown>;
      const booksField = (value as { books?: unknown }).books;
      if (!hasBook) {
        if (Array.isArray(booksField)) {
          const books = booksField as BookListRow[];
          const filtered = books.filter((row) => row.id !== bookId);
          if (filtered.length !== books.length) {
            ns.entries.set(key, { ...entry, value: { ...value, books: filtered } });
            changed = true;
          }
        }
      } else if (book !== undefined) {
        if (Array.isArray(booksField)) {
          const books = booksField as BookListRow[];
          const alreadyPresent = books.some((row) => row.id === book.id);
          if (!alreadyPresent) {
            // Book structurally satisfies BookListRow ({id: number} + extras), но Record<string, unknown> и
            // конкретный interface Book не overlap-ятся в строгом смысле — TS требует unknown-промежуток.
            ns.entries.set(key, { ...entry, value: { ...value, books: [...books, book as unknown as BookListRow] } });
            changed = true;
          }
        }
      } else {
        // Add без карточки — нет данных для точечной правки, инвалидируем запись.
        // Накапливаем ключи, удаляем после итерации; delete внутри for-of по Map работает,
        // но паттерн хрупкий — копим явный список.
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      ns.entries.delete(key);
      changed = true;
      invalidated = true;
    }
    if (changed) {
      ns.version += 1;
      if (invalidated) ns.invalidationVersion += 1;
      this.persist(namespace);
      this.notify(namespace);
    }
  }

  applyShelfRename(payload: DomainEventMap["shelfRenamed"]): void {
    const { shelfId, name } = payload;
    this.hydratePersistedNamespaces();
    const namespace = `shelf/${shelfId}`;
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    let changed = false;
    // invariant: namespace ⇒ entity-id binding
    // Запись находится в namespace shelf/{shelfId} — namespace гарантирует принадлежность
    // именно этой полке, дополнительная проверка shelf.id не нужна.
    for (const [key, entry] of ns.entries) {
      const value = entry.value as { shelf?: { name?: unknown } } & Record<string, unknown>;
      const shelf = value.shelf;
      if (shelf) {
        ns.entries.set(key, { ...entry, value: { ...value, shelf: { ...shelf, name } } });
        changed = true;
      }
    }
    if (changed) {
      ns.version += 1;
      this.persist(namespace);
      this.notify(namespace);
    }
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

  private setEntryIfChanged(ns: Namespace, key: string, next: CacheEntry): boolean {
    const current = ns.entries.get(key);
    if (current && Object.is(current.context, next.context) && deepEqual(current.value, next.value)) {
      return false;
    }
    ns.entries.set(key, next);
    return true;
  }

  private updateNamespaceEntries(
    namespace: string,
    updater: (entry: CacheEntry, key: string) => CacheEntry | undefined,
  ): void {
    this.hydratePersistedNamespaces();
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    let changed = false;
    for (const [key, entry] of ns.entries) {
      const next = updater(entry, key);
      if (next === undefined) continue;
      changed = this.setEntryIfChanged(ns, key, next) || changed;
    }
    if (!changed) return;
    ns.version += 1;
    this.persist(namespace);
    this.notify(namespace);
  }

  private updateNamespacePrefixEntries(
    prefix: string,
    updater: (namespace: string, entry: CacheEntry) => CacheEntry | undefined,
  ): void {
    this.hydratePersistedNamespaces();
    for (const [namespace, ns] of this.namespaces) {
      if (!namespace.startsWith(prefix)) continue;
      let changed = false;
      for (const [key, entry] of ns.entries) {
        const next = updater(namespace, entry);
        if (next === undefined) continue;
        changed = this.setEntryIfChanged(ns, key, next) || changed;
      }
      if (!changed) continue;
      ns.version += 1;
      this.persist(namespace);
      this.notify(namespace);
    }
  }

  private patchRowListNamespace<T extends { id: number } & Record<string, unknown>>(
    namespace: string,
    field: string,
    id: number,
    patch: Partial<T>,
    sorter: (rows: T[], key: string) => T[],
    canSortRows?: (rows: readonly T[]) => boolean,
  ): void {
    this.updateNamespaceEntries(namespace, (entry, key) => {
      if (!isRecord(entry.value)) return undefined;
      const value = entry.value as Record<string, unknown>;
      const rows = value[field];
      if (!Array.isArray(rows)) return undefined;
      const result = mergeRowById(rows as T[], id, patch);
      if (!result.changed) return undefined;
      const rowsAreMalformed = rows.some((row) => !isRecord(row) || typeof (row as { id?: unknown }).id !== "number");
      const nextRows = rowsAreMalformed || canSortRows === undefined || !canSortRows(result.rows)
        ? result.rows
        : sorter(result.rows, key);
      return { ...entry, value: { ...value, [field]: nextRows } };
    });
  }

  private patchArrayNamespace<T extends { id: number } & Record<string, unknown>>(
    namespace: string,
    id: number,
    patch: Partial<T>,
    sorter: (rows: T[], key: string) => T[],
    canSortRows?: (rows: readonly T[]) => boolean,
  ): void {
    this.updateNamespaceEntries(namespace, (entry, key) => {
      if (!Array.isArray(entry.value)) return undefined;
      const rows = entry.value;
      const result = mergeRowById(rows as T[], id, patch);
      if (!result.changed) return undefined;
      const rowsAreMalformed = rows.some((row) => !isRecord(row) || typeof (row as { id?: unknown }).id !== "number");
      const nextRows = rowsAreMalformed || canSortRows === undefined || !canSortRows(result.rows)
        ? result.rows
        : sorter(result.rows, key);
      return { ...entry, value: nextRows };
    });
  }

  private patchNestedRefsInNamespace(
    namespace: string,
    listField: string,
    refField: string,
    id: number,
    patch: Partial<{ id: number; name: string; sortName?: string }>,
  ): void {
    this.updateNamespaceEntries(namespace, (entry) => {
      if (!isRecord(entry.value)) return undefined;
      const value = entry.value as Record<string, unknown>;
      const rows = value[listField];
      if (!Array.isArray(rows)) return undefined;
      let changed = false;
      const nextRows = rows.map((row) => {
        if (!isRecord(row) || !Array.isArray(row[refField])) return row;
        const result = patchNamedRefs(
          row[refField] as Array<{ id: number; name: string; sortName?: string }>,
          id,
          patch,
        );
        if (!result.changed) return row;
        changed = true;
        return { ...row, [refField]: result.refs };
      });
      return changed ? { ...entry, value: { ...value, [listField]: nextRows } } : undefined;
    });
  }

  private updateBookListEntries(
    updater: (entry: CacheEntry & { value: BookListValue }) => { value?: BookListValue; delete?: boolean },
  ): void {
    this.hydratePersistedNamespaces();
    for (const [namespace, ns] of this.namespaces) {
      let changed = false;
      let invalidated = false;
      for (const [key, entry] of ns.entries) {
        if (!isBookList(entry.value)) continue;
        const result = updater(entry as CacheEntry & { value: BookListValue });
        if (result.delete) {
          ns.entries.delete(key);
          changed = true;
          invalidated = true;
        } else if (result.value) {
          const nextEntry = { ...entry, value: result.value };
          changed = this.setEntryIfChanged(ns, key, nextEntry) || changed;
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
    for (const handler of subscriberSnapshot(ns)) {
      handler();
    }
  }

  private persist(namespace: string): void {
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    sessionStorage.setItem(STORAGE_PREFIX + namespace, JSON.stringify(Object.fromEntries(ns.entries)));
  }
}

function subscriberSnapshot(ns: Namespace): Array<() => void> {
  return Array.from(ns.subscribers);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
  sortName: string,
): BookListRow {
  if (!Array.isArray(row.authors)) return row;
  return {
    ...row,
    authors: row.authors.map((author) => (
      isAuthorRef(author) && author.id === payload.authorId
        ? { ...author, name: payload.name, sortName }
        : author
    )),
  };
}

function patchSeriesRef(
  row: BookListRow,
  payload: DomainEventMap["seriesRenamed"],
  sortName: string,
): BookListRow {
  if (isRefWithId(row.series, payload.seriesId)) {
    return {
      ...row,
      series: {
        ...row.series,
        name: payload.name,
        sortName,
      },
    };
  }
  return row;
}

function patchTagRefs(
  row: BookListRow,
  payload: DomainEventMap["tagRenamed"],
): BookListRow {
  if (!Array.isArray(row.tags)) return row;
  return {
    ...row,
    tags: row.tags.map((tag) => (
      isTagRef(tag) && tag.id === payload.tagId
        ? { ...tag, name: payload.name }
        : tag
    )),
  };
}

function sortNamePatch(sortName: string | undefined): { sortName?: string } {
  return sortName === undefined ? {} : { sortName };
}

function deriveAuthorSortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
}

function isAuthorRef(value: unknown): value is { id: number; name: string; sortName?: string } {
  return hasNumericId(value);
}

function isTagRef(value: unknown): value is { id: number; name: string } {
  return hasNumericId(value);
}

function isRefWithId(value: unknown, id: number): value is { id: number; name?: string; sortName?: string } {
  return typeof value === "object"
    && value !== null
    && (value as { id?: unknown }).id === id;
}

function isBookListRow(value: unknown): value is BookListRow {
  return hasNumericId(value);
}

function hasNumericId(value: unknown): value is { id: number } {
  return typeof value === "object"
    && value !== null
    && typeof (value as { id?: unknown }).id === "number";
}

function isValidNameRow(value: unknown): value is { name: string } {
  return isRecord(value) && typeof value.name === "string";
}

function isValidSortNameRow(value: unknown): value is { name: string; sortName?: string } {
  return isRecord(value)
    && typeof value.name === "string"
    && (value.sortName === undefined || typeof value.sortName === "string");
}

function readPersistedNamespace(namespace: string): Map<string, CacheEntry> {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + namespace);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return new Map(
        Object.entries(parsed as Record<string, unknown>)
          .flatMap(([key, entry]) => {
            const normalized = normalizePersistedEntry(entry);
            return normalized ? [[key, normalized] as const] : [];
          }),
      );
    }
    return new Map();
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
  return isBaseBookListContext(context)
    && hasValidOptionalContextFields(context)
    && hasValidSourceSpecificFields(context);
}

function isBaseBookListContext(context: Record<string, unknown>): boolean {
  return context.kind === "book-list"
    && typeof context.key === "string"
    && typeof context.source === "string"
    && BOOK_LIST_SOURCES.has(context.source)
    && typeof context.sort === "string"
    && BOOK_LIST_SORTS.has(context.sort);
}

function hasValidOptionalContextFields(context: Record<string, unknown>): boolean {
  return isOptionalNumber(context.authorId)
    && isOptionalNumber(context.seriesId)
    && isOptionalNumber(context.tagId)
    && isOptionalNumber(context.shelfId)
    && (context.query === undefined || typeof context.query === "string")
    && isFilters(context.filters);
}

function hasValidSourceSpecificFields(context: Record<string, unknown>): boolean {
  return matchesSourceNumberField(context, "author-detail", "authorId")
    && matchesSourceNumberField(context, "series-detail", "seriesId")
    && matchesSourceNumberField(context, "tag-detail", "tagId")
    && matchesShelfSourceField(context);
}

function matchesSourceNumberField(context: Record<string, unknown>, source: string, field: string): boolean {
  if (context.source === source) return typeof context[field] === "number";
  return context[field] === undefined;
}

function matchesShelfSourceField(context: Record<string, unknown>): boolean {
  if (isShelfSource(context.source)) return typeof context.shelfId === "number";
  return context.shelfId === undefined;
}

function isShelfSource(source: unknown): boolean {
  return source === "shelf-regular" || source === "shelf-best" || source === "shelf-reading-now";
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
