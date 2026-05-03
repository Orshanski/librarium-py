import { client, type ClientQuery } from "../client";
import type { RawBook } from "@/types";

export interface BookFileInfo {
  id: number;
  format: string;
  fileSize: number | null;
}

export interface BookIdentifier {
  type: string;
  value: string;
}

export interface BookDetailResponse {
  book: RawBook;
  files: BookFileInfo[];
  identifiers: BookIdentifier[];
}

export interface BookListParams extends ClientQuery {
  sort?: string;
  cursor?: number;
  pageSize?: number;
  authorIds?: number[] | string[];
  seriesIds?: number[] | string[];
  tagIds?: number[] | string[];
  language?: string[];
}

export interface BookListResponse {
  books: RawBook[];
  hasMore: boolean;
  nextCursor?: number;
  total?: number;
}

export interface BookUpdatePayload {
  title: string;
  description: string;
  language: string;
  publisher: string | null;
  pubDate: string | null;
  seriesId: number | string | null;
  seriesNumber: number | null;
  authorIds: (number | string)[];
  tagIds: (number | string)[];
  addFormats: string[];
  deleteFormats: string[];
  commitCover: boolean;
}

export interface BookOkResponse {
  ok: true;
}

export interface UpdateBookResponse extends BookDetailResponse {
  ok: true;
}

export interface AddFormatResponse {
  ok: true;
  format: string;
}

export function listBooks(
  params: BookListParams = {},
  signal?: AbortSignal,
): Promise<BookListResponse> {
  return client<BookListResponse>("GET", "/api/books", {
    query: { ...params },
    signal,
  });
}

export function getBook(
  id: number,
  signal?: AbortSignal,
): Promise<BookDetailResponse> {
  return client<BookDetailResponse>("GET", `/api/books/${id}`, { signal });
}

export function updateBook(
  id: number,
  body: BookUpdatePayload,
): Promise<UpdateBookResponse> {
  return client<UpdateBookResponse>("PUT", `/api/books/${id}`, { body });
}

export function deleteBook(id: number): Promise<BookOkResponse> {
  return client<BookOkResponse>("DELETE", `/api/books/${id}`);
}

export function setRating(id: number, rating: number): Promise<BookOkResponse> {
  return client<BookOkResponse>("PUT", `/api/books/${id}/rating`, {
    body: { rating },
  });
}

export function setRead(id: number, isRead: boolean): Promise<BookOkResponse> {
  return client<BookOkResponse>("PUT", `/api/books/${id}/read`, {
    body: { isRead },
  });
}

export interface DownloadOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number, bytes: number) => void;
}

export function downloadBook(
  id: number,
  format: string,
  opts: DownloadOptions = {},
): Promise<Blob> {
  return client<Blob>("GET", `/api/books/${id}/download`, {
    query: { format },
    blob: true,
    signal: opts.signal,
    onProgress: opts.onProgress,
  });
}

export function addFormat(
  id: number,
  tempId: string,
): Promise<AddFormatResponse> {
  return client<AddFormatResponse>("POST", `/api/books/${id}/add-format`, {
    body: { tempId },
  });
}
