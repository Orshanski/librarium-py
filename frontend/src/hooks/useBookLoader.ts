import { useBookLoaderBase } from "./useBookLoaderBase";
import type { BookLoaderOptions, BookLoaderResult } from "./useBookLoaderBase";

export type { BookLoaderResult } from "./useBookLoaderBase";

export function useBookLoader(options: BookLoaderOptions): BookLoaderResult {
  return useBookLoaderBase(options, async ({ download }) => ({
    blob: await download(),
    title: "",
    fromCache: false,
  }));
}
