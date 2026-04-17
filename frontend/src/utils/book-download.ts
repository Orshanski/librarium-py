import { downloadBook as apiDownloadBook } from "@/api/endpoints/books";

/** Download a book file with streaming progress. */
export async function downloadBook(
  id: string,
  format: string,
  onProgress: (progress: number, bytes?: number) => void,
  signal?: AbortSignal,
): Promise<File> {
  const blob = await apiDownloadBook(Number(id), format, {
    signal,
    onProgress: (percent, bytes) => onProgress(percent, bytes),
  });
  return new File([blob], `book.${format}`, { type: blob.type });
}
