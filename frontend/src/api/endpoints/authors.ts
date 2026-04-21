import { client } from "../client";
import type { RawBook } from "@/types";

export interface Author {
  id: number;
  name: string;
  sort_name?: string;
  tags?: string | null;
  book_count: number;
}

export interface AuthorListParams {
  tagIds?: number[] | string[];
  language?: string[];
}

export interface AuthorListResponse {
  authors: Author[];
  // backend also returns tags/languages at top level but list page ignores them
}

export interface AuthorDetailResponse {
  author: Author;
  books: RawBook[];
}

export interface AuthorOkResponse {
  ok: true;
}

export function listAuthors(
  params: AuthorListParams = {},
  signal?: AbortSignal,
): Promise<AuthorListResponse> {
  return client<AuthorListResponse>("GET", "/api/authors", { query: { ...params }, signal });
}

export function getAuthor(id: number, signal?: AbortSignal): Promise<AuthorDetailResponse> {
  return client<AuthorDetailResponse>("GET", `/api/authors/${id}`, { signal });
}

export function renameAuthor(id: number, name: string): Promise<AuthorOkResponse> {
  return client<AuthorOkResponse>("PUT", `/api/authors/${id}`, { body: { name } });
}

export function mergeAuthor(id: number, sourceId: number): Promise<AuthorOkResponse> {
  return client<AuthorOkResponse>("POST", `/api/authors/${id}/merge`, { body: { sourceId } });
}

export function deleteAuthor(id: number): Promise<AuthorOkResponse> {
  return client<AuthorOkResponse>("DELETE", `/api/authors/${id}`);
}
