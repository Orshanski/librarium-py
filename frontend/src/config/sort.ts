import rawConfig from "../../../config/sort.json";

export interface SortOption {
  key: string;
  label: string;
}

export interface SortConfig {
  default: string;
  options: string[];   // sort keys (labels берутся из SORT_LABELS)
}

interface RawSortConfig {
  catalog: SortConfig;
  tag: SortConfig;
  shelf_best: SortConfig;
  shelf_reading_now: SortConfig;
  shelf_regular: SortConfig;
  labels: Record<string, string>;
}

const config: RawSortConfig = rawConfig as RawSortConfig;

export const SORT_LABELS: Record<string, string> = config.labels;

export const SORT_CONFIG = {
  catalog: config.catalog,
  tag: config.tag,
  shelf_best: config.shelf_best,
  shelf_reading_now: config.shelf_reading_now,
  shelf_regular: config.shelf_regular,
};

export function shelfSortConfigKey(systemCode: string | null | undefined): keyof typeof SORT_CONFIG {
  if (systemCode === "best") return "shelf_best";
  if (systemCode === "reading_now") return "shelf_reading_now";
  return "shelf_regular";
}

export function sortOptionsFor(pageKey: keyof typeof SORT_CONFIG): SortOption[] {
  return SORT_CONFIG[pageKey].options.map(k => ({ key: k, label: SORT_LABELS[k] }));
}
