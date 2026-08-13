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
 * Detail-page book — card-level fields plus the 8 detail fields (sortTitle,
 * description, language, publisher, pubDate, addedAt, updatedAt, recapPath).
 * Mirrors backend BookDetailItem (BookCardItem subset preserved).
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
  recapPath?: string | null;
}

export interface BookFileInfo {
  id: number;
  format: string;
  fileSize: number | null;
}

export interface BookIdentifier {
  type: string;
  value: string;
}

export interface BookDetailSnapshot {
  book: BookDetail;
  files: BookFileInfo[];
  identifiers: BookIdentifier[];
}
