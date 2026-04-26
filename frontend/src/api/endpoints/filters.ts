import { client, type ClientQuery } from "../client";

export interface FilterAuthor {
  id: number;
  name: string;
}

export interface FilterSeries {
  id: number;
  name: string;
}

export interface FilterTag {
  id: number;
  name: string;
}

export interface FilterLanguage {
  name: string;
}

export type FilterOptionsKey = "authors" | "series" | "tags" | "languages";

// Per-key response shapes. The backend returns the list under a field matching
// the key (`{authors: [...]}`, `{series: [...]}`, etc.) — not a tagged union,
// so we cannot rely on `switch (resp.key)` narrowing. Instead, overloads let
// the caller get the narrow type for a concrete key literal; the runtime
// fallback signature returns `FilterOptionsResponse` for dynamic keys.
export type FilterOptionsResponse =
  | { authors: FilterAuthor[] }
  | { series: FilterSeries[] }
  | { tags: FilterTag[] }
  | { languages: FilterLanguage[] };

export interface FilterOptionsParams extends ClientQuery {
  authorIds?: number[] | string[];
  seriesIds?: number[] | string[];
  tagIds?: number[] | string[];
  language?: string[];
}

export function listFilterOptions(
  key: "authors",
  params?: FilterOptionsParams,
  signal?: AbortSignal,
): Promise<{ authors: FilterAuthor[] }>;
export function listFilterOptions(
  key: "series",
  params?: FilterOptionsParams,
  signal?: AbortSignal,
): Promise<{ series: FilterSeries[] }>;
export function listFilterOptions(
  key: "tags",
  params?: FilterOptionsParams,
  signal?: AbortSignal,
): Promise<{ tags: FilterTag[] }>;
export function listFilterOptions(
  key: "languages",
  params?: FilterOptionsParams,
  signal?: AbortSignal,
): Promise<{ languages: FilterLanguage[] }>;
// Fallback overload for callers passing a dynamic `FilterOptionsKey` (e.g. in a
// loop over filterKeys). Without this, TS only sees the four literal-key
// overloads and cannot match a union parameter.
export function listFilterOptions(
  key: FilterOptionsKey,
  params?: FilterOptionsParams,
  signal?: AbortSignal,
): Promise<FilterOptionsResponse>;
export function listFilterOptions(
  key: FilterOptionsKey,
  params: FilterOptionsParams = {},
  signal?: AbortSignal,
): Promise<FilterOptionsResponse> {
  return client<FilterOptionsResponse>("GET", `/api/filter-options/${key}`, {
    query: { ...params },
    signal,
  });
}

export function listPublishers(
  signal?: AbortSignal,
): Promise<{ publishers: string[] }> {
  return client<{ publishers: string[] }>("GET", "/api/publishers", { signal });
}
