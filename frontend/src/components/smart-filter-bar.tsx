import { useMemo } from "react";
import { useIsMobile } from "../responsive";
import FilterBar, { FilterConfig, FilterOption } from "./filter-bar";
import MobileFilterBar from "./mobile/mobile-filter-bar";
import { listFilterOptions, type FilterOptionsKey } from "../api/endpoints/filters";
import type { ApiFilterParams } from "../api/filter-params";
import type { FilterKey, SelectedFilters } from "../api/filter-types";
import { FILTER_QUERY_KEYS } from "../api/filter-types";
import { metadataCache, useCachedResource } from "../cache";

export type { FilterKey, SelectedFilters };
export type { ApiFilterParams };
export { FILTER_QUERY_KEYS };

// Читает значения 4 стандартных фильтров (authorIds/seriesIds/tagIds/language)
// из query-params и собирает SelectedFilters. Используется страницами-списками
// (CatalogPage, AuthorsPage, SeriesListPage, TagPage) чтобы избежать дубля одного паттерна.
export function readSelectedFromSearchParams(searchParams: URLSearchParams): SelectedFilters {
  const selected: SelectedFilters = {};
  for (const key of FILTER_QUERY_KEYS) {
    const values = searchParams.getAll(key);
    if (values.length) selected[key] = values;
  }
  return selected;
}

interface SmartFilterBarProps {
  filterKeys: FilterKey[];
  selected: SelectedFilters;
  onSelectionChange: (key: FilterKey, values: string[]) => void;
  onClearAll?: () => void;
  baseFilters?: ApiFilterParams;
}

const FILTER_META: Record<FilterKey, { apiKey: FilterOptionsKey; label: string; responseKey: string }> = {
  authorIds: { apiKey: "authors", label: "Автор", responseKey: "authors" },
  seriesIds: { apiKey: "series", label: "Серия", responseKey: "series" },
  tagIds: { apiKey: "tags", label: "Жанр", responseKey: "tags" },
  language: { apiKey: "languages", label: "Язык", responseKey: "languages" },
};

const KEY_ORDER: FilterKey[] = ["authorIds", "seriesIds", "tagIds", "language"];

function serializeBase(baseFilters?: ApiFilterParams): string {
  if (!baseFilters) return "";
  return KEY_ORDER.map(k => `${k}=${JSON.stringify(baseFilters[k] ?? null)}`).join("|");
}

export function buildQueryParams(
  ownKey: FilterKey,
  selected: SelectedFilters,
  baseFilters?: ApiFilterParams,
): ApiFilterParams {
  const out: ApiFilterParams = { ...baseFilters };
  for (const key of KEY_ORDER) {
    if (key === ownKey) continue;
    const values = selected[key];
    if (!values?.length) continue;
    const base = out[key] as string[] | number[] | undefined;
    out[key] = base ? ([...new Set([...base.map(String), ...values])] as string[]) : values;
  }
  return out;
}

function optionCacheKey(key: FilterKey, selected: SelectedFilters, baseFilters?: ApiFilterParams): string {
  const params = buildQueryParams(key, selected, baseFilters);
  const query = new URLSearchParams();
  for (const [paramKey, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(paramKey, String(item));
      }
    } else {
      query.set(paramKey, String(value));
    }
  }
  return `${FILTER_META[key].apiKey}?${query.toString()}`;
}

function useFilterOptions(
  key: FilterKey,
  active: boolean,
  selected: SelectedFilters,
  baseFilters?: ApiFilterParams,
): FilterOption[] | undefined {
  const meta = FILTER_META[key];
  const cacheKey = active ? optionCacheKey(key, selected, baseFilters) : `inactive:${key}`;
  const fetcher = useMemo(
    () => async (signal: AbortSignal) => {
      if (!active) return [];
      try {
        const response = await listFilterOptions(meta.apiKey, buildQueryParams(key, selected, baseFilters), signal);
        return (response[meta.responseKey as keyof typeof response] || []) as FilterOption[];
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        return [];
      }
    },
    [key, meta.apiKey, meta.responseKey, cacheKey, active],
  );
  return useCachedResource(metadataCache, `filter-options/${meta.apiKey}`, cacheKey, fetcher).data;
}

export default function SmartFilterBar({
  filterKeys,
  selected,
  onSelectionChange,
  onClearAll,
  baseFilters,
}: SmartFilterBarProps) {
  const isMobile = useIsMobile();

  // Build stable dependency key
  const selectedKey = filterKeys
    .map((k) => `${k}:${(selected[k] || []).join(",")}`)
    .join("|");
  const baseKey = serializeBase(baseFilters);
  const filterKeysKey = filterKeys.join(",");

  const activeKeys = new Set(filterKeys);
  const authorOptions = useFilterOptions("authorIds", activeKeys.has("authorIds"), selected, baseFilters);
  const seriesOptions = useFilterOptions("seriesIds", activeKeys.has("seriesIds"), selected, baseFilters);
  const tagOptions = useFilterOptions("tagIds", activeKeys.has("tagIds"), selected, baseFilters);
  const languageOptions = useFilterOptions("language", activeKeys.has("language"), selected, baseFilters);
  const options: Record<FilterKey, FilterOption[] | undefined> = useMemo(() => ({
    authorIds: authorOptions,
    seriesIds: seriesOptions,
    tagIds: tagOptions,
    language: languageOptions,
  }), [
    selectedKey,
    baseKey,
    filterKeysKey,
    authorOptions,
    seriesOptions,
    tagOptions,
    languageOptions,
  ]);

  const filterConfigs: FilterConfig[] = filterKeys
    .filter((key) => options[key])
    .map((key) => ({
      key,
      label: FILTER_META[key].label,
      options: options[key] || [],
    }));

  const selectedRecord: Record<string, string[]> = {};
  for (const key of filterKeys) {
    if (selected[key]?.length) selectedRecord[key] = selected[key]!;
  }

  const Bar = isMobile ? MobileFilterBar : FilterBar;

  return (
    <Bar
      filters={filterConfigs}
      selected={selectedRecord}
      onSelectionChange={(key, values) => onSelectionChange(key as FilterKey, values)}
      onClearAll={onClearAll}
    />
  );
}
