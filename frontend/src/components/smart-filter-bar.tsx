import { useState, useEffect, useRef } from "react";
import { useIsMobile } from "../responsive";
import FilterBar, { FilterConfig, FilterOption } from "./filter-bar";
import MobileFilterBar from "./mobile/mobile-filter-bar";

export type FilterKey = "author" | "series" | "genre" | "language";

export interface ApiFilterParams {
  authorIds?: string[];
  seriesIds?: string[];
  tagIds?: string[];
  language?: string;
}

export type SelectedFilters = Partial<Record<FilterKey, string[]>>;

interface SmartFilterBarProps {
  filterKeys: FilterKey[];
  selected: SelectedFilters;
  onSelectionChange: (key: FilterKey, values: string[]) => void;
  onClearAll?: () => void;
  baseFilters?: ApiFilterParams;
}

const FILTER_META: Record<FilterKey, { endpoint: string; apiParam: string; label: string; responseKey: string }> = {
  author: { endpoint: "/api/filter-options/authors", apiParam: "authorIds", label: "Автор", responseKey: "authors" },
  series: { endpoint: "/api/filter-options/series", apiParam: "seriesIds", label: "Серия", responseKey: "series" },
  genre: { endpoint: "/api/filter-options/tags", apiParam: "tagIds", label: "Жанр", responseKey: "tags" },
  language: { endpoint: "/api/filter-options/languages", apiParam: "language", label: "Язык", responseKey: "languages" },
};

const CACHE_PREFIX = "librarium_filter_options_";

function cacheKey(filterKeys: FilterKey[], baseFilters?: ApiFilterParams): string {
  const parts = [
    filterKeys.join(","),
    baseFilters?.authorIds?.join(",") || "",
    baseFilters?.tagIds?.join(",") || "",
    baseFilters?.seriesIds?.join(",") || "",
    baseFilters?.language || "",
  ];
  return CACHE_PREFIX + parts.join("|");
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

function buildQueryParams(
  key: FilterKey,
  selected: SelectedFilters,
  baseFilters?: ApiFilterParams,
): URLSearchParams {
  const params = new URLSearchParams();
  const ownApiParam = FILTER_META[key].apiParam;

  // baseFilters — always included, never excluded by own dimension
  if (baseFilters) {
    if (baseFilters.authorIds?.length) {
      params.set("authorIds", baseFilters.authorIds.join(","));
    }
    if (baseFilters.tagIds?.length) {
      params.set("tagIds", baseFilters.tagIds.join(","));
    }
    if (baseFilters.seriesIds?.length) {
      params.set("seriesIds", baseFilters.seriesIds.join(","));
    }
    if (baseFilters.language) {
      params.set("language", baseFilters.language);
    }
  }

  // selected — exclude own dimension
  for (const [uiKey, values] of Object.entries(selected)) {
    if (!values?.length) continue;
    const apiParam = FILTER_META[uiKey as FilterKey]?.apiParam;
    if (!apiParam || apiParam === ownApiParam) continue;

    if (apiParam === "language") {
      if (!params.has("language")) params.set("language", values[0]);
    } else {
      const existing = params.get(apiParam);
      if (existing) {
        const merged = new Set([...existing.split(","), ...values]);
        params.set(apiParam, [...merged].join(","));
      } else {
        params.set(apiParam, values.join(","));
      }
    }
  }

  return params;
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
  const baseKey = baseFilters
    ? `${baseFilters.authorIds?.join(",") || ""}|${baseFilters.tagIds?.join(",") || ""}|${baseFilters.seriesIds?.join(",") || ""}|${baseFilters.language || ""}`
    : "";
  const filterKeysKey = filterKeys.join(",");

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetches = filterKeys.map(async (key) => {
      const meta = FILTER_META[key];
      const params = buildQueryParams(key, selected, baseFilters);
      const url = params.toString() ? `${meta.endpoint}?${params}` : meta.endpoint;

      try {
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) return { key, data: [] };
        const json = await resp.json();
        return { key, data: json[meta.responseKey] || [] };
      } catch {
        return { key, data: [] };
      }
    });

    Promise.all(fetches).then((results) => {
      if (controller.signal.aborted) return;
      const newOptions: Record<string, FilterOption[]> = {};
      for (const { key, data } of results) {
        newOptions[key] = data;
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
