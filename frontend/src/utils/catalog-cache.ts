const CACHE_KEY = "librarium_catalog";

export function removeBookFromCatalogCache(bookId: number): void {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.books = data.books.filter((b: any) => b.id !== bookId);
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}
