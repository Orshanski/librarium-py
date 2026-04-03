export interface BookFormat {
  format: string;
  size: string;
}

export interface Book {
  id: number;
  title: string;
  authors: string[];
  series: string | null;
  seriesNumber: number | null;
  tags: string[];
  rating: number | null; // 1-5
  language: string;
  coverPath: string;
  description: string | null;
  publisher: string | null;
  pubDate: string | null;
  formats: BookFormat[];
  isbn: string | null;
}

/** Raw book data from API (GROUP_CONCAT strings for authors/tags). */
export interface RawBook {
  id: number;
  title: string;
  authors: string | null;
  series_name: string | null;
  series_number: number | null;
  tags: string | null;
  rating: number | null;
  language: string | null;
  cover_path: string | null;
  description: string | null;
  publisher: string | null;
  pub_date: string | null;
  updated_at: string | null;
  // Reading progress fields (present on "reading_now" shelf)
  fraction?: number | null;
  last_format?: string | null;
  last_read_at?: string | null;
  [key: string]: unknown;
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
    authors: splitCsv(b.authors),
    series: b.series_name ?? null,
    seriesNumber: b.series_number ?? null,
    tags: splitCsv(b.tags),
    rating: b.rating ?? null,
    language: b.language || "",
    coverPath: opts?.fullCover
      ? `/api/covers/${b.id}?full=1&t=${b.updated_at || ""}`
      : `/api/covers/${b.id}?t=${b.updated_at || ""}`,
    description: b.description ?? null,
    publisher: b.publisher ?? null,
    pubDate: b.pub_date ?? null,
    formats: [],
    isbn: opts?.isbn ?? null,
  };
}

export interface Author {
  name: string;
  bookCount: number;
  tags: string[];
}

export interface Series {
  name: string;
  author: string;
  bookCount: number;
}

export interface Shelf {
  id: number;
  name: string;
  bookIds: number[];
}
