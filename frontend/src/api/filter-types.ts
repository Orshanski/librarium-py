export type FilterKey = "authorIds" | "seriesIds" | "tagIds" | "language";
export type SelectedFilters = Partial<Record<FilterKey, string[]>>;

// Полный перечень ключей фильтров в адресной строке. Страницы читают из адреса
// все четыре ключа независимо от того, для скольких показывают чипы, поэтому
// сброс обязан снимать тоже все четыре.
export const FILTER_QUERY_KEYS: readonly FilterKey[] = ["authorIds", "seriesIds", "tagIds", "language"];
