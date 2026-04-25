import { client } from "../client";
import type { AuthorRef, SeriesRef } from "@/types";

// /api/search wire is snake_case — SearchResponse не использует RESPONSE_CONFIG
// на бэке (backend/app/dtos/search.py), оставлен в pre-pbz2 формате.
// authors/series — структурированные объекты (Backend Tasks 4/8/9), но
// scalar-поля и SearchBookHit остаются snake_case.

export interface SearchBookHit {
  id: number;
  title: string;
  cover_path: string | null;
  authors: AuthorRef[];
  series: SeriesRef | null;
}

export interface SearchAuthorResult {
  id: number;
  name: string;
  book_count: number;
}

export interface SearchSeriesResult {
  id: number;
  name: string;
  authors: AuthorRef[];
  book_count: number;
}

export interface SearchResponse {
  books: SearchBookHit[];
  authors: SearchAuthorResult[];
  series: SearchSeriesResult[];
}

export interface SearchOptions {
  /** Max results per category. Backend default is 50. */
  limit?: number;
  /** AbortSignal for cancelling stale requests (e.g. fast typing in query). */
  signal?: AbortSignal;
}

export function searchAll(
  q: string,
  signalOrOptions?: AbortSignal | SearchOptions,
): Promise<SearchResponse> {
  const options: SearchOptions =
    signalOrOptions instanceof AbortSignal
      ? { signal: signalOrOptions }
      : signalOrOptions ?? {};
  const query: Record<string, unknown> = { q };
  if (options.limit !== undefined) query.limit = options.limit;
  return client<SearchResponse>("GET", "/api/search", {
    query,
    signal: options.signal,
  });
}
