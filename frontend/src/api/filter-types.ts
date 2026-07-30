// Полный перечень ключей фильтров в адресной строке — единственный источник истины:
// тип FilterKey выведен из него, поэтому добавить пятый фильтр, забыв про перечень,
// нельзя. Страницы читают из адреса все ключи независимо от того, для скольких
// показывают чипы, поэтому и сброс обязан снимать все.
//
// Порядок значим: по нему идут сборка исходящего запроса и сериализация базовых
// фильтров в smart-filter-bar, а значит и порядок параметров в запросе, и строка
// ключа кэша опций. Менять порядок — менять ключи кэша.
export const FILTER_QUERY_KEYS = ["authorIds", "seriesIds", "tagIds", "language"] as const;

export type FilterKey = (typeof FILTER_QUERY_KEYS)[number];
export type SelectedFilters = Partial<Record<FilterKey, string[]>>;

/**
 * Полезная нагрузка для updateParams, снимающая все ключи фильтров сразу.
 * Литерал с аннотацией, а не Object.fromEntries: тот выводится как any (map даёт
 * массив, а не кортеж), и опечатка в ключе прошла бы мимо tsc. Аннотация без `as`
 * заодно требует полноты — пятый ключ в FilterKey сразу даст ошибку здесь.
 */
export function clearedFilters(): Record<FilterKey, undefined> {
  const cleared: Record<FilterKey, undefined> = {
    authorIds: undefined,
    seriesIds: undefined,
    tagIds: undefined,
    language: undefined,
  };
  return cleared;
}

/** Есть ли в адресе хоть один выбранный фильтр — по всем ключам, а не только по видимым чипам. */
export function hasAnyFilterSelected(selected: SelectedFilters): boolean {
  return FILTER_QUERY_KEYS.some((key) => (selected[key]?.length ?? 0) > 0);
}

/**
 * Читает значения всех ключей фильтров из query-params и собирает SelectedFilters.
 * Используется страницами-списками (CatalogPage, AuthorsPage, SeriesListPage, TagPage),
 * чтобы не дублировать один паттерн.
 */
export function readSelectedFromSearchParams(searchParams: URLSearchParams): SelectedFilters {
  const selected: SelectedFilters = {};
  for (const key of FILTER_QUERY_KEYS) {
    const values = searchParams.getAll(key);
    if (values.length) selected[key] = values;
  }
  return selected;
}
