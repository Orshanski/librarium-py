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

export function searchAll(q: string): Promise<SearchResponse> {
  return client<SearchResponse>("GET", "/api/search", { query: { q } });
}
