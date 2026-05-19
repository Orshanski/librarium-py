import { client, type ClientQuery } from "../client";
import type { Book, AuthorRef } from "@/types";

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
  books: Book[];
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
  const query: ClientQuery = { q };
  if (options.limit !== undefined) query.limit = options.limit;
  return client<SearchResponse>("GET", "/api/search", {
    query,
    signal: options.signal,
  });
}
