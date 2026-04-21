import { useState, useEffect, useRef } from "react";
import { useIsMobile } from "../responsive";
import FilterBar, { FilterConfig, FilterOption } from "./filter-bar";
import MobileFilterBar from "./mobile/mobile-filter-bar";
import { listFilterOptions, type FilterOptionsKey } from "../api/endpoints/filters";
import type { ApiFilterParams } from "../api/filter-params";

export type FilterKey = "authorIds" | "seriesIds" | "tagIds" | "language";

export type SelectedFilters = Partial<Record<FilterKey, string[]>>;

export type { ApiFilterParams };

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

const CACHE_PREFIX = "librarium_filter_options_";
const KEY_ORDER: FilterKey[] = ["authorIds", "seriesIds", "tagIds", "language"];

function serializeBase(baseFilters?: ApiFilterParams): string {
  if (!baseFilters) return "";
  return KEY_ORDER.map(k => `${k}=${JSON.stringify(baseFilters[k] ?? null)}`).join("|");
}

function cacheKey(filterKeys: FilterKey[], baseFilters?: ApiFilterParams): string {
  return `${CACHE_PREFIX}${filterKeys.join(",")}|${serializeBase(baseFilters)}`;
}

function loadCachedOptions(filterKeys: FilterKey[], baseFilters?: ApiFilterParams): Record<string, FilterOption[]> {
  try {
    const raw = sessionStorage.getItem(cacheKey(filterKeys, baseFilters));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCachedOptions(filterKeys: FilterKey[], options: Record<string, FilterOption[]>, baseFilters?: ApiFilterParams) {
  try {
    sessionStorage.setItem(cacheKey(filterKeys, baseFilters), JSON.stringify(options));
  } catch {}
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

export default function SmartFilterBar({
  filterKeys,
  selected,
  onSelectionChange,
  onClearAll,
  baseFilters,
}: SmartFilterBarProps) {
  const isMobile = useIsMobile();
  const [options, setOptions] = useState<Record<string, FilterOption[]>>(() => loadCachedOptions(filterKeys, baseFilters));
  const abortRef = useRef<AbortController | null>(null);

  // Build stable dependency key
  const selectedKey = filterKeys
    .map((k) => `${k}:${(selected[k] || []).join(",")}`)
    .join("|");
  const baseKey = serializeBase(baseFilters);
  const filterKeysKey = filterKeys.join(",");

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetches = filterKeys.map(async (key) => {
      const meta = FILTER_META[key];
      const filterParams = buildQueryParams(key, selected, baseFilters);

      try {
        const response = await listFilterOptions(meta.apiKey, filterParams, controller.signal);
        const data = response[meta.responseKey as keyof typeof response] || [];
        return { key, data };
      } catch (err) {
        // Explicitly skip AbortError — it's expected control flow, not an error to report/setState.
        // Check by `name` (not `instanceof DOMException`) — the concrete class
        // varies between runtimes; client.ts rethrows AbortError as-is.
        if (err instanceof Error && err.name === "AbortError") {
          return null;
        }
        // For real errors, return empty data
        return { key, data: [] };
      }
    });

    Promise.all(fetches).then((results) => {
      if (controller.signal.aborted) return;
      const newOptions: Record<string, FilterOption[]> = {};
      for (const result of results) {
        if (result !== null) {
          const { key, data } = result;
          newOptions[key] = data;
        }
      }
      setOptions(newOptions);
      saveCachedOptions(filterKeys, newOptions, baseFilters);
    });

    return () => controller.abort();
  }, [selectedKey, baseKey, filterKeysKey]);

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
