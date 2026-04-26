import type { UploadMetadata } from "@/api/endpoints/upload";
import type { BookGroup, UploadEntry } from "./upload-form.types";

export function formatSize(bytes: number): string {
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}

export function groupKey(title: string, authors: string): string {
  return (title.trim() + "|||" + authors.trim()).toLowerCase();
}

export function mergeMeta(a: UploadMetadata, b: UploadMetadata): UploadMetadata {
  const pick = (va: string, vb: string) => va || vb;
  return {
    title: a.title.length >= b.title.length ? a.title : b.title,
    authors: pick(a.authors, b.authors),
    series: pick(a.series, b.series),
    seriesNumber: pick(a.seriesNumber, b.seriesNumber),
    description: (a.description || "").length >= (b.description || "").length ? a.description : b.description,
    language: pick(a.language, b.language),
    tags: (a.tags || "").length >= (b.tags || "").length ? a.tags : b.tags,
    publisher: pick(a.publisher, b.publisher),
    pubDate: pick(a.pubDate, b.pubDate),
    isbn: pick(a.isbn, b.isbn),
    coverUrl: (a.coverUrl ?? null) || (b.coverUrl ?? null),
  };
}

export function updateFileInGroups(
  groups: BookGroup[],
  fileId: string,
  transform: (file: UploadEntry) => UploadEntry,
): BookGroup[] {
  return groups.map((g) => ({
    ...g,
    files: g.files.map((f) => (f.id === fileId ? transform(f) : f)),
  }));
}

export function groupHasReadyFormat(group: BookGroup, format: string): boolean {
  return group.files.some((f) => f.format === format && f.status === "ready");
}

export function groupsShareReadyFormat(a: BookGroup, b: BookGroup): boolean {
  return a.files.some((af) =>
    af.status === "ready" && b.files.some((bf) => bf.status === "ready" && bf.format === af.format)
  );
}
