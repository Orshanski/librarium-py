import { client } from "../client";
import type { RawBook } from "@/types";

export interface Shelf {
  id: number;
  name: string;
  is_system: boolean;
  has_book?: boolean;
  book_count?: number;
  system_code?: string;
}

export interface ShelvesListResponse {
  shelves: Shelf[];
  bookShelves?: { id: number; has_book: boolean }[];
}

export interface ShelfDetailResponse {
  shelf: Shelf;
  books: RawBook[];
}

export interface CreateShelfResponse {
  id: number;
}

export interface ShelfOkResponse {
  ok: true;
}

export function listShelves(
  bookId?: number,
  signal?: AbortSignal,
): Promise<ShelvesListResponse> {
  const query: Record<string, unknown> = {};
  if (bookId !== undefined) query.bookId = bookId;
  return client<ShelvesListResponse>("GET", "/api/shelves", { query, signal });
}

export function createShelf(name: string): Promise<CreateShelfResponse> {
  return client<CreateShelfResponse>("POST", "/api/shelves", { body: { name } });
}

export function getShelf(
  id: number,
  signal?: AbortSignal,
): Promise<ShelfDetailResponse> {
  return client<ShelfDetailResponse>("GET", `/api/shelves/${id}`, { signal });
}

export function deleteShelf(id: number): Promise<ShelfOkResponse> {
  return client<ShelfOkResponse>("DELETE", `/api/shelves/${id}`);
}

export function addBookToShelf(
  shelfId: number,
  bookId: number,
): Promise<ShelfOkResponse> {
  return client<ShelfOkResponse>("POST", `/api/shelves/${shelfId}/books`, {
    body: { bookId },
  });
}

export function removeBookFromShelf(
  shelfId: number,
  bookId: number,
): Promise<ShelfOkResponse> {
  return client<ShelfOkResponse>(
    "DELETE",
    `/api/shelves/${shelfId}/books/${bookId}`,
  );
}
