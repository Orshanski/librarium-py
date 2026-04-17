import { downloadBook as apiDownloadBook } from "@/api/endpoints/books";

/**
 * Download a book file with streaming progress.
 *
 * `onProgress(percent, bytes)`:
 *   - `percent > 0` — real percentage (Content-Length was present)
 *   - `percent < 0` — sentinel: total unknown; use `bytes` (received so far)
 *   - `percent === 0` — initial/idle
 */
export async function downloadBook(
  id: string,
  format: string,
  onProgress: (percent: number, bytes: number) => void,
  signal?: AbortSignal,
): Promise<File> {
  const blob = await apiDownloadBook(Number(id), format, { signal, onProgress });
  return new File([blob], `book.${format}`, { type: blob.type });
}
