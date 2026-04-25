import { client } from "../client";
import type { RawBook } from "@/types";

export interface Series {
  id: number;
  name: string;
  sort_name?: string;
  authors?: string | null;
  book_count: number;
}

export interface SeriesListParams {
  authorIds?: number[] | string[];
  tagIds?: number[] | string[];
  language?: string[];
}

export interface SeriesListResponse {
  series: Series[];
  // backend also returns authors/tags/languages at top level but list page ignores them
}

export interface SeriesDetailResponse {
  series: Series;
  books: RawBook[];
}

export interface SeriesOkResponse {
  ok: true;
}

export function listSeries(
  params: SeriesListParams = {},
  signal?: AbortSignal,
): Promise<SeriesListResponse> {
  return client<SeriesListResponse>("GET", "/api/series", { query: { ...params }, signal });
}

export function getSeries(id: number, signal?: AbortSignal): Promise<SeriesDetailResponse> {
  return client<SeriesDetailResponse>("GET", `/api/series/${id}`, { signal });
}

export function renameSeries(id: number, name: string): Promise<SeriesOkResponse> {
  return client<SeriesOkResponse>("PUT", `/api/series/${id}`, { body: { name } });
}

export function mergeSeries(id: number, sourceId: number): Promise<SeriesOkResponse> {
  return client<SeriesOkResponse>("POST", `/api/series/${id}/merge`, { body: { sourceId } });
}

export function deleteSeries(id: number): Promise<SeriesOkResponse> {
  return client<SeriesOkResponse>("DELETE", `/api/series/${id}`);
}
