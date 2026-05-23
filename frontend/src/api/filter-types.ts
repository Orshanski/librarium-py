export type FilterKey = "authorIds" | "seriesIds" | "tagIds" | "language";
export type SelectedFilters = Partial<Record<FilterKey, string[]>>;
