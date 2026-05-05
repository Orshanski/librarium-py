import { client, type ClientQuery } from "../client";
import type { OkResponse } from "../types";
import type { RawBook, AuthorRef } from "@/types";

export interface Series {
  id: number;
  name: string;
  sortName?: string;
  authors?: AuthorRef[];
  bookCount: number;
}

export interface SeriesListParams extends ClientQuery {
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

export function listSeries(
  params: SeriesListParams = {},
  signal?: AbortSignal,
): Promise<SeriesListResponse> {
  return client<SeriesListResponse>("GET", "/api/series", { query: { ...params }, signal });
}

export function getSeries(id: number, signal?: AbortSignal): Promise<SeriesDetailResponse> {
  return client<SeriesDetailResponse>("GET", `/api/series/${id}`, { signal });
}

export function renameSeries(id: number, name: string): Promise<OkResponse> {
  return client<OkResponse>("PUT", `/api/series/${id}`, { body: { name } });
}

export function mergeSeries(id: number, sourceId: number): Promise<OkResponse> {
  return client<OkResponse>("POST", `/api/series/${id}/merge`, { body: { sourceId } });
}

export function deleteSeries(id: number): Promise<OkResponse> {
  return client<OkResponse>("DELETE", `/api/series/${id}`);
}
