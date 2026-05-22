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

export interface BookFormat {
  format: string;
  size: string;
}

/**
 * Card-level book contract — same shape across catalog, author, series, tag,
 * shelf, search responses. Strict subset; detail-only fields live in
 * BookDetail. Mirrors backend BookCardItem (1:1, camelCase wire).
 */
export interface Book {
  id: number;
  title: string;
  authors: AuthorRef[];
  series: SeriesRef | null;
  seriesNumber: number | null;
  coverPath: string;
  rating: number | null;
  isRead: boolean;
  tags: TagRef[];
}

/**
 * Detail-page book — card-level fields plus the 8 detail fields (description,
 * language, publisher, pubDate, tags, sortTitle, addedAt, updatedAt). Mirrors
 * backend BookDetailItem (BookCardItem subset preserved).
 *
 * Note: `formats` (BookFormat[]) and `isbn` are NOT on BookDetail — they come
 * from sibling fields `files` / `identifiers` on the BookDetailResponse and
 * are passed to detail/edit components as separate props.
 */
export interface BookDetail extends Book {
  sortTitle: string | null;
  description: string | null;
  language: string | null;
  publisher: string | null;
  pubDate: string | null;
  addedAt: string;
  updatedAt: string;
}
