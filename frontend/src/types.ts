export interface BookFormat {
  format: string;
  size: string;
}

export interface AuthorRef {
  id: number;
  name: string;
}

export interface TagRef {
  id: number;
  name: string;
}

export interface SeriesRef {
  id: number;
  name: string;
}

export interface Book {
  id: number;
  title: string;
  authors: string[];
  series: string | null;
  seriesId?: number | null;
  seriesNumber: number | null;
  tags: string[];
  tagIds?: number[];
  authorIds?: number[];
  rating: number | null; // 1-5
  isRead: boolean;
  language: string;
  coverPath: string;
  description: string | null;
  publisher: string | null;
  pubDate: string | null;
  formats: BookFormat[];
  isbn: string | null;
  sortTitle?: string | null;
  addedAt?: string;
  updatedAt?: string;
  fraction?: number | null;
  lastFormat?: string | null;
  lastReadAt?: string | null;
}

/** Raw book data from API (object arrays for authors/tags/series). */
export interface RawBook {
  id: number;
  title: string;
  authors: AuthorRef[];
  series: SeriesRef | null;
  seriesNumber: number | null;
  tags: TagRef[];
  rating: number | null;
  language: string | null;
  coverPath: string | null;
  description: string | null;
  publisher: string | null;
  pubDate: string | null;
  updatedAt: string | null;
  isRead?: number | null;
  fraction?: number | null;
  lastFormat?: string | null;
  lastReadAt?: string | null;
}

/** Split a comma-separated string into trimmed non-empty array. */
export function splitCsv(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Convert raw API book to Book type for components. */
export function toBook(b: RawBook, opts?: { fullCover?: boolean; isbn?: string | null }): Book {
  return {
    id: b.id,
    title: b.title,
    authors: b.authors.map((a) => a.name),
    series: b.series?.name ?? null,
    seriesNumber: b.seriesNumber,
    tags: b.tags.map((t) => t.name),
    rating: b.rating ?? null,
    isRead: !!(b.isRead),
    language: b.language || "",
    coverPath: opts?.fullCover
      ? `/api/covers/${b.id}?full=1&t=${b.updatedAt || ""}`
      : `/api/covers/${b.id}?t=${b.updatedAt || ""}`,
    description: b.description ?? null,
    publisher: b.publisher ?? null,
    pubDate: b.pubDate ?? null,
    formats: [],
    isbn: opts?.isbn ?? null,
  };
}
