import { client } from "../client";
import type { RawBook } from "@/types";

export interface SearchAuthorResult {
  id: number;
  name: string;
  book_count: number;
}

export interface SearchSeriesResult {
  id: number;
  name: string;
  authors: string;
  book_count: number;
}

export interface SearchResponse {
  books: RawBook[];
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
