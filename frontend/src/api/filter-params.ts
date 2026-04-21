import type { SelectedFilters } from "../components/smart-filter-bar";

export interface ApiFilterParams {
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
