const KEYS: Record<string, string> = {
  catalog: "librarium_breadcrumb_catalog",
  authors: "librarium_breadcrumb_authors",
  series: "librarium_breadcrumb_series",
  tags: "librarium_breadcrumb_tags",
};

export function saveBreadcrumbUrl(section: string, url: string) {
  const key = KEYS[section];
  if (key) sessionStorage.setItem(key, url);
}

export function getBreadcrumbUrl(section: string, fallback: string): string {
  const key = KEYS[section];
  if (!key) return fallback;
  return sessionStorage.getItem(key) || fallback;
}
