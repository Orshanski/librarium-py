export function invalidateAllCaches(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith("librarium_") && key !== "librarium_pwa_debug" && !key.startsWith("librarium_breadcrumb_") && key !== "librarium_book_origin") {
      toRemove.push(key);
    }
  }
  toRemove.forEach((k) => sessionStorage.removeItem(k));
}
