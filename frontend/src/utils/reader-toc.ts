import type { TocItem, FlatTocItem } from "../types/reader-toc";

export function flattenToc(items: TocItem[], depth = 0, maxDepth = Infinity): FlatTocItem[] {
  const result: FlatTocItem[] = [];
  if (depth > maxDepth) return result;
  for (const item of items) {
    result.push({ label: item.label, href: item.href, depth });
    if (item.subitems && depth + 1 <= maxDepth) {
      result.push(...flattenToc(item.subitems, depth + 1, maxDepth));
    }
  }
  return result;
}
