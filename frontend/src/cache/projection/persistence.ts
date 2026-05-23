import type { BookListContext } from "@/domain/read-models";
import { hasBooksArray, isBookList } from "./book-list";
import { isBookListContext } from "./book-list-context";

export type PersistedCacheEntry = {
  value: unknown;
  context?: BookListContext;
};

export const STORAGE_PREFIX = "librarium_metadata_cache_";

export function readPersistedNamespace(namespace: string): Map<string, PersistedCacheEntry> {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + namespace);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return new Map(
        Object.entries(parsed as Record<string, unknown>)
          .flatMap(([key, entry]) => {
            const normalized = normalizePersistedEntry(entry);
            return normalized ? [[key, normalized] as const] : [];
          }),
      );
    }
    return new Map();
  } catch {
    return new Map();
  }
}

function normalizePersistedEntry(entry: unknown): PersistedCacheEntry | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  if (!("value" in entry)) return undefined;
  const value = (entry as { value: unknown }).value;
  const context = (entry as { context?: unknown }).context;
  if (hasBooksArray(value) && !isBookList(value)) return undefined;
  return {
    value,
    context: isBookListContext(context) ? context : undefined,
  };
}
