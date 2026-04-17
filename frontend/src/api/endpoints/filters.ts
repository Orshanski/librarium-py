import { client } from "../client";

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

export type FilterKey = "authors" | "series" | "tags" | "languages";

// Discriminated response — the key determines shape.
export type FilterOptionsResponse =
  | { authors: FilterAuthor[] }
  | { series: FilterSeries[] }
  | { tags: FilterTag[] }
  | { languages: FilterLanguage[] };

export interface FilterOptionsParams {
  /** CSV of author ids. */
  authorIds?: string;
  /** CSV of series ids. */
  seriesIds?: string;
  /** CSV of tag ids. */
  tagIds?: string;
  /** Language filter. */
  language?: string;
}

export function listFilterOptions(
  key: FilterKey,
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
