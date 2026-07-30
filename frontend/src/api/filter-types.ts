// Полный перечень ключей фильтров в адресной строке — единственный источник истины:
// тип FilterKey выведен из него, поэтому добавить пятый фильтр, забыв про перечень,
// нельзя. Страницы читают из адреса все ключи независимо от того, для скольких
// показывают чипы, поэтому и сброс обязан снимать все.
export const FILTER_QUERY_KEYS = ["authorIds", "seriesIds", "tagIds", "language"] as const;

export type FilterKey = (typeof FILTER_QUERY_KEYS)[number];
export type SelectedFilters = Partial<Record<FilterKey, string[]>>;

/**
 * Полезная нагрузка для updateParams, снимающая все ключи фильтров сразу.
 * Возвращает типизированный Record, а не результат Object.fromEntries: тот
 * выводится как any (map даёт массив, а не кортеж), и опечатка в ключе прошла бы
 * мимо tsc.
 */
export function clearedFilters(): Record<FilterKey, undefined> {
  const cleared = {} as Record<FilterKey, undefined>;
  for (const key of FILTER_QUERY_KEYS) {
    cleared[key] = undefined;
  }
  return cleared;
}

/** Есть ли в адресе хоть один выбранный фильтр — по всем ключам, а не только по видимым чипам. */
export function hasAnyFilterSelected(selected: SelectedFilters): boolean {
  return FILTER_QUERY_KEYS.some((key) => (selected[key]?.length ?? 0) > 0);
}
