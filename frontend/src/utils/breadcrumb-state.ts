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

const BOOK_ORIGIN_KEY = "librarium_book_origin";

export function saveBookOrigin(label: string, href: string) {
  try {
    sessionStorage.setItem(BOOK_ORIGIN_KEY, JSON.stringify({ label, href }));
  } catch {}
}

export function getBookOrigin(): { label: string; href: string } {
  try {
    const raw = sessionStorage.getItem(BOOK_ORIGIN_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { label: "Каталог", href: "/" };
}
