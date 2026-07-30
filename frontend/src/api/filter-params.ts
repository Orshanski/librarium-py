import type { SelectedFilters } from "./filter-types";
import { FILTER_QUERY_KEYS } from "./filter-types";
import type { ClientQuery } from "./client";

export interface ApiFilterParams extends ClientQuery {
  authorIds?: number[] | string[];
  seriesIds?: number[] | string[];
  tagIds?: number[] | string[];
  language?: string[];
}

// Обход по FILTER_QUERY_KEYS, а не четыре именованные проверки: иначе новый ключ,
// добавленный в перечень, молча не доехал бы до запроса, и tsc об этом не сказал бы.
export function selectedToApiParams(selected: SelectedFilters): ApiFilterParams {
  const params: ApiFilterParams = {};
  for (const key of FILTER_QUERY_KEYS) {
    const values = selected[key];
    // Значения фильтров приходят из адресной строки, то есть всегда string[] —
    // это подмножество типа поля в ApiFilterParams (number[] | string[] для id-ключей).
    if (values?.length) params[key] = values;
  }
  return params;
}
