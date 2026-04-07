const CACHE_KEY = "librarium_catalog";

export function removeBookFromCatalogCache(bookId: number): void {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.books = data.books.filter((b: { id: number }) => b.id !== bookId);
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

export function invalidateAllCaches(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith("librarium_") && key !== "librarium_pwa_debug") {
      toRemove.push(key);
    }
  }
  toRemove.forEach((k) => sessionStorage.removeItem(k));
}
