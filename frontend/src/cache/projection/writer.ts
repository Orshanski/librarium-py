import type { BookListContext } from "@/domain/read-models";
import type { BookListValue } from "./book-list";

export type ProjectionCacheEntry = {
  value: unknown;
  context?: BookListContext;
};

export type BookListProjectionEntry = ProjectionCacheEntry & { value: BookListValue };

export type BookListUpdateResult = {
  value?: BookListValue;
  delete?: boolean;
};

export type ProjectionWriter = {
  updateBookListEntries(updater: (entry: BookListProjectionEntry) => BookListUpdateResult): void;
  updateNamespacePrefixEntries(
    prefix: string,
    updater: (namespace: string, entry: ProjectionCacheEntry) => ProjectionCacheEntry | undefined,
  ): void;
  patchDetailNamespace(
    namespace: string,
    updater: (value: Record<string, unknown>) => Record<string, unknown> | undefined,
  ): void;
  patchRowListNamespace<T extends { id: number } & Record<string, unknown>>(
    namespace: string,
    field: string,
    id: number,
    patch: Partial<T>,
    sorter: (rows: T[], key: string) => T[],
    canSortRows?: (rows: readonly T[]) => boolean,
  ): void;
  patchArrayNamespace<T extends { id: number } & Record<string, unknown>>(
    namespace: string,
    id: number,
    patch: Partial<T>,
    sorter: (rows: T[], key: string) => T[],
    canSortRows?: (rows: readonly T[]) => boolean,
  ): void;
  patchNestedRefsInNamespace(
    namespace: string,
    listField: string,
    refField: string,
    id: number,
    patch: Partial<{ id: number; name: string; sortName?: string }>,
  ): void;
};
