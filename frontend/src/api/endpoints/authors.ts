import { client, type ClientQuery } from "../client";
import type { OkResponse } from "../types";
import type { Book, TagRef } from "@/types";

export interface Author {
  id: number;
  name: string;
  sortName?: string;
  tags?: TagRef[];
  bookCount: number;
}

export interface AuthorListParams extends ClientQuery {
  tagIds?: number[] | string[];
  language?: string[];
}

export interface AuthorListResponse {
  authors: Author[];
  // backend also returns tags/languages at top level but list page ignores them
}

export interface AuthorDetailResponse {
  author: Author;
  books: Book[];
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

export function renameAuthor(id: number, name: string): Promise<OkResponse> {
  return client<OkResponse>("PUT", `/api/authors/${id}`, { body: { name } });
}

export function mergeAuthor(id: number, sourceId: number): Promise<OkResponse> {
  return client<OkResponse>("POST", `/api/authors/${id}/merge`, { body: { sourceId } });
}

export function deleteAuthor(id: number): Promise<OkResponse> {
  return client<OkResponse>("DELETE", `/api/authors/${id}`);
}
