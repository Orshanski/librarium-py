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
  authorIds?: string;
  tagIds?: string;
  seriesIds?: string;
  language?: string;
}
