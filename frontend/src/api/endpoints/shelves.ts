import { client, type ClientQuery } from "../client";
import type { OkResponse } from "../types";
import type { Book } from "@/types";

/** Reading progress entry for a single book on the reading_now shelf.
 *  Lives at ShelfDetail.progressByBookId — separate from books[] because
 *  progress is a property of the reading process, not of the book. */
export interface ShelfProgressEntry {
  fraction: number;
  lastFormat: string;
  lastReadAt: string;
}

export interface Shelf {
  id: number;
  name: string;
  isSystem: boolean;
  hasBook?: boolean;
  bookCount?: number;
  systemCode?: string;
}

export interface ShelfSummary {
  id: number;
  name: string;
  isSystem: boolean;
  systemCode?: string | null;
}

export interface BookShelfMembership {
  id: number;
  hasBook: boolean;
}

export interface ShelvesListResponse {
  shelves: Shelf[];
  bookShelves?: BookShelfMembership[];
}

export interface ShelfDetail {
  shelf: ShelfSummary;
  books: Book[];
  /** Populated only for reading_now shelf; absent/omitted otherwise. */
  progressByBookId?: Record<number, ShelfProgressEntry>;
}

export interface CreateShelfResponse {
  id: number;
}

export function listShelves(
  bookId?: number,
  signal?: AbortSignal,
): Promise<ShelvesListResponse> {
  const query: ClientQuery = {};
  if (bookId !== undefined) query.bookId = bookId;
  return client<ShelvesListResponse>("GET", "/api/shelves", { query, signal });
}

export function createShelf(name: string): Promise<CreateShelfResponse> {
  return client<CreateShelfResponse>("POST", "/api/shelves", { body: { name } });
}

export function getShelf(
  id: number,
  opts: { sort?: string } = {},
  signal?: AbortSignal,
): Promise<ShelfDetail> {
  const query: ClientQuery = {};
  if (opts.sort) query.sort = opts.sort;
  return client<ShelfDetail>("GET", `/api/shelves/${id}`, { query, signal });
}

export function deleteShelf(id: number): Promise<OkResponse> {
  return client<OkResponse>("DELETE", `/api/shelves/${id}`);
}

export function addBookToShelf(
  shelfId: number,
  bookId: number,
): Promise<OkResponse> {
  return client<OkResponse>("POST", `/api/shelves/${shelfId}/books`, {
    body: { bookId },
  });
}

export function removeBookFromShelf(
  shelfId: number,
  bookId: number,
): Promise<OkResponse> {
  return client<OkResponse>(
    "DELETE",
    `/api/shelves/${shelfId}/books/${bookId}`,
  );
}
