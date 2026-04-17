/**
 * Shared types for the typed API client.
 * Additional domain-specific types live in endpoints/<domain>.ts
 * or extend this file as migration progresses.
 */

export interface User {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: "admin" | "reader";
}

export interface BookListParams {
  sort?: string;
  cursor?: number;
  pageSize?: number;
  /** CSV of numeric ids, e.g. "1,2,3". Backend parses via parse_ids(). */
  authorIds?: string;
  /** CSV of numeric ids, e.g. "1,2,3". Backend parses via parse_ids(). */
  tagIds?: string;
  /** CSV of numeric ids, e.g. "1,2,3". Backend parses via parse_ids(). */
  seriesIds?: string;
  language?: string;
}
