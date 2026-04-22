const KEY = "librarium_cache_version";

export const CATALOG_CACHE_KEY = "librarium_catalog_cache";

export function getCacheVersion(): number {
  const raw = sessionStorage.getItem(KEY);
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function invalidateCache(): void {
  const next = getCacheVersion() + 1;
  sessionStorage.setItem(KEY, String(next));
}
