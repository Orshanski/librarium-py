import type { SelectedFilters } from "./filter-types";
import type { ClientQuery } from "./client";

export interface ApiFilterParams extends ClientQuery {
  authorIds?: number[] | string[];
  seriesIds?: number[] | string[];
  tagIds?: number[] | string[];
  language?: string[];
}

export function selectedToApiParams(selected: SelectedFilters): ApiFilterParams {
  const params: ApiFilterParams = {};
  if (selected.authorIds?.length) params.authorIds = selected.authorIds;
  if (selected.seriesIds?.length) params.seriesIds = selected.seriesIds;
  if (selected.tagIds?.length) params.tagIds = selected.tagIds;
  if (selected.language?.length) params.language = selected.language;
  return params;
}
