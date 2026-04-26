import { client, type ClientQuery } from "../client";
import type { Book, AuthorRef, SeriesRef } from "@/types";

export interface SearchBookHit {
  id: number;
  title: string;
  coverPath: string | null;
  authors: AuthorRef[];
  series: SeriesRef | null;
}

export interface SearchAuthorResult {
  id: number;
  name: string;
  bookCount: number;
}

export interface SearchSeriesResult {
  id: number;
  name: string;
  authors: AuthorRef[];
  bookCount: number;
}

export interface SearchResponse {
  books: SearchBookHit[];
  authors: SearchAuthorResult[];
  series: SearchSeriesResult[];
}

/** Convert a search hit to a Book-shaped object for BookCard rendering. */
export function searchHitToBook(hit: SearchBookHit): Book {
  return {
    id: hit.id,
    title: hit.title,
    authors: hit.authors.map((a) => a.name),
    series: hit.series?.name ?? null,
    seriesId: hit.series?.id ?? null,
    seriesNumber: null,
    tags: [],
    rating: null,
    isRead: false,
    language: "",
    coverPath: `/api/covers/${hit.id}`,
    description: null,
    publisher: null,
    pubDate: null,
    formats: [],
    isbn: null,
  };
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
  const query: ClientQuery = { q };
  if (options.limit !== undefined) query.limit = options.limit;
  return client<SearchResponse>("GET", "/api/search", {
    query,
    signal: options.signal,
  });
}
