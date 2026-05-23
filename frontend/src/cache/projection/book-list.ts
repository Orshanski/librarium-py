import type { DomainEventMap } from "@/domain/events";
import { isRecord } from "./guards";

export type BookListRow = { id: number } & Record<string, unknown>;
export type BookListValue = { books: BookListRow[] } & Record<string, unknown>;

export function isBookList(value: unknown): value is BookListValue {
  return typeof value === "object"
    && value !== null
    && Array.isArray((value as { books?: unknown }).books)
    && (value as { books: unknown[] }).books.every(isBookListRow);
}

export function patchBookList(value: BookListValue, book: { id: number } & Record<string, unknown>): BookListValue {
  return {
    ...value,
    books: value.books.map((row) => (row.id === book.id ? { ...row, ...book } : row)),
  };
}

export function patchAuthorRefs(
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

export function patchSeriesRef(
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

export function patchTagRefs(
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

export function deriveAuthorSortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
}

export function hasNumericId(value: unknown): value is { id: number } {
  return typeof value === "object"
    && value !== null
    && typeof (value as { id?: unknown }).id === "number";
}

export function hasBooksArray(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && Array.isArray((value as { books?: unknown }).books);
}

export function isValidNameRow(value: unknown): value is { name: string } {
  return isRecord(value) && typeof value.name === "string";
}

export function isValidSortNameRow(value: unknown): value is { name: string; sortName?: string } {
  return isRecord(value)
    && typeof value.name === "string"
    && (value.sortName === undefined || typeof value.sortName === "string");
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
