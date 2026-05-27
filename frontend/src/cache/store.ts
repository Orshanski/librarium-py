import type { DomainEventMap } from "@/domain/events";
import type { BookListContext } from "@/domain/read-models";
import { applyAuthorRename as applyAuthorRenameProjection } from "./projection/authors";
import { isBookList } from "./projection/book-list";
import type { BookListRow, BookListValue } from "./projection/book-list";
import { applyBookRowPatch, applyBookUpdate as applyBookUpdateProjection } from "./projection/books";
import { isRecord } from "./projection/guards";
import { patchArrayRowListValue, patchNestedRefsValue, patchObjectRowListValue } from "./projection/namespace-rows";
import { applySeriesRename as applySeriesRenameProjection } from "./projection/series";
import { projectShelfMembershipChange, applyShelfRename as applyShelfRenameProjection } from "./projection/shelves";
import { applyTagRename as applyTagRenameProjection } from "./projection/tags";
import type { BookListProjectionEntry, BookListUpdateResult, ProjectionCacheEntry, ProjectionWriter } from "./projection/writer";
import { readPersistedNamespace, STORAGE_PREFIX } from "./storage/persistence";
import type { PersistedCacheEntry } from "./storage/persistence";

type CacheEntry = PersistedCacheEntry;

type Namespace = {
  entries: Map<string, CacheEntry>;
  subscribers: Set<() => void>;
  version: number;
  invalidationVersion: number;
};

export class MetadataCacheStore {
  private readonly namespaces = new Map<string, Namespace>();
  private readonly projectionWriter: ProjectionWriter = {
    updateBookListEntries: (updater) => this.updateBookListEntries(updater),
    updateNamespacePrefixEntries: (prefix, updater) => this.updateNamespacePrefixEntries(prefix, updater),
    patchDetailNamespace: (namespace, updater) => this.patchDetailNamespace(namespace, updater),
    patchRowListNamespace: (namespace, field, id, patch, sorter, canSortRows) => {
      this.patchRowListNamespace(namespace, field, id, patch, sorter, canSortRows);
    },
    patchArrayNamespace: (namespace, id, patch, sorter, canSortRows) => {
      this.patchArrayNamespace(namespace, id, patch, sorter, canSortRows);
    },
    patchNestedRefsInNamespace: (namespace, listField, refField, id, patch) => {
      this.patchNestedRefsInNamespace(namespace, listField, refField, id, patch);
    },
  };

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
    applyBookRowPatch(this.projectionWriter, book);
  }

  applyBookUpdate(payload: DomainEventMap["bookUpdated"]): void {
    applyBookUpdateProjection(this.projectionWriter, payload);
  }

  applyAuthorRename(payload: DomainEventMap["authorRenamed"]): void {
    applyAuthorRenameProjection(this.projectionWriter, payload);
  }

  applySeriesRename(payload: DomainEventMap["seriesRenamed"]): void {
    applySeriesRenameProjection(this.projectionWriter, payload);
  }

  applyTagRename(payload: DomainEventMap["tagRenamed"]): void {
    applyTagRenameProjection(this.projectionWriter, payload);
  }

  applyShelfMembershipChange(payload: DomainEventMap["shelfMembershipChanged"]): void {
    const { shelfId } = payload;
    this.hydratePersistedNamespaces();
    const namespace = `shelf/${shelfId}`;
    const ns = this.namespaces.get(namespace);
    if (!ns) return;
    const result = projectShelfMembershipChange(ns.entries, payload);
    for (const [key, entry] of result.entries) {
      ns.entries.set(key, entry);
    }
    for (const key of result.invalidatedKeys) {
      ns.entries.delete(key);
    }
    const changed = result.entries.length > 0 || result.invalidatedKeys.length > 0;
    if (changed) {
      ns.version += 1;
      if (result.invalidatedKeys.length > 0) ns.invalidationVersion += 1;
      this.persist(namespace);
      this.notify(namespace);
    }
  }

  applyReadingProgressChange(payload: DomainEventMap["readingProgressChanged"]): void {
    if (payload.hadPosition !== payload.hasPosition) {
      this.updateBookListEntries((entry) => (
        entry.context?.source === "shelf-reading-now" ? { delete: true } : {}
      ));
      return;
    }
    if (!payload.hasPosition) return;
    this.updateBookListEntries((entry) => {
      if (entry.context?.source !== "shelf-reading-now") return {};
      if (!entry.value.books.some((book) => book.id === payload.bookId)) {
        return payload.lastReadAtChanged ? { delete: true } : {};
      }
      const progressByBookId = readProgressByBookId(entry.value.progressByBookId) ?? {};
      const nextProgressByBookId = {
        ...progressByBookId,
        [payload.bookId]: {
          fraction: payload.fraction,
          lastFormat: payload.lastFormat,
          lastReadAt: payload.lastReadAt,
        },
      };
      return {
        value: {
          ...entry.value,
          books: payload.lastReadAtChanged
            ? sortBooksByLastReadAtDesc(entry.value.books, nextProgressByBookId)
            : entry.value.books,
          progressByBookId: nextProgressByBookId,
        },
      };
    });
  }

  applyShelfRename(payload: DomainEventMap["shelfRenamed"]): void {
    applyShelfRenameProjection(this.projectionWriter, payload);
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
    updater: (entry: ProjectionCacheEntry, key: string) => ProjectionCacheEntry | undefined,
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
    updater: (namespace: string, entry: ProjectionCacheEntry) => ProjectionCacheEntry | undefined,
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

  private patchDetailNamespace(
    namespace: string,
    updater: (value: Record<string, unknown>) => Record<string, unknown> | undefined,
  ): void {
    this.updateNamespaceEntries(namespace, (entry) => {
      if (!isRecord(entry.value)) return undefined;
      const value = updater(entry.value);
      return value === undefined ? undefined : { ...entry, value };
    });
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
      const value = patchObjectRowListValue(entry.value, field, id, patch, sorter, key, canSortRows);
      return value === undefined ? undefined : { ...entry, value };
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
      const value = patchArrayRowListValue(entry.value, id, patch, sorter, key, canSortRows);
      return value === undefined ? undefined : { ...entry, value };
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
      const value = patchNestedRefsValue(entry.value, listField, refField, id, patch);
      return value === undefined ? undefined : { ...entry, value };
    });
  }

  private updateBookListEntries(
    updater: (entry: BookListProjectionEntry) => BookListUpdateResult,
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

function sameContext(left: BookListContext | undefined, right: BookListContext | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readProgressByBookId(value: unknown): Record<number, unknown> | undefined {
  return isRecord(value) ? value as Record<number, unknown> : undefined;
}

function sortBooksByLastReadAtDesc<T extends { id: number }>(
  books: T[],
  progressByBookId: Record<number, unknown>,
): T[] {
  return [...books].sort((left, right) => (
    readProgressLastReadAt(progressByBookId[right.id]).localeCompare(readProgressLastReadAt(progressByBookId[left.id]))
  ));
}

function readProgressLastReadAt(value: unknown): string {
  return isRecord(value) && typeof value.lastReadAt === "string" ? value.lastReadAt : "";
}
