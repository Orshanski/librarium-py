import { downloadBook as apiDownloadBook } from "@/api/endpoints/books";

/** Download a book file with streaming progress. */
export async function downloadBook(
  id: string,
  format: string,
  onProgress: (progress: number) => void,
): Promise<File> {
  const blob = await apiDownloadBook(Number(id), format);
  onProgress(100);
  return new File([blob], `book.${format}`, { type: blob.type });
}
