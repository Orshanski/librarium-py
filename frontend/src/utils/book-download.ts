/** Download a book file with streaming progress. */
export async function downloadBook(
  id: string,
  format: string,
  onProgress: (progress: number) => void,
): Promise<File> {
  const r = await fetch(`/api/books/${id}/download?format=${format}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to download book");
  if (!r.body) {
    const b = await r.blob();
    return new File([b], `book.${format}`, { type: b.type });
  }
  const total = Number(r.headers.get("content-length")) || 0;
  const reader = r.body.getReader();
  let received = 0;
  const chunks: BlobPart[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(total ? Math.round((received / total) * 100) : -(received));
  }
  const blob = new Blob(chunks);
  return new File([blob], `book.${format}`, { type: r.headers.get("content-type") || "" });
}
