import { client } from "../client";
import type { RawBook } from "@/types";

export interface CloudTag {
  id: number;
  name: string;
  book_count: number;
}

export interface DirectoryTag {
  id: number;
  name: string;
}

export interface TagCloudResponse {
  tags: CloudTag[];
}

export interface TagOptionsResponse {
  tags: DirectoryTag[];
}

export interface TagBooksResponse {
  tag: {
    id: number;
    name: string;
    code: string | null;
    book_count: number;
  };
  books: RawBook[];
}

export interface MapTagResponse {
  ok: true;
  targetId: number;
}

export interface TagQuery {
  authorIds?: string;
  seriesIds?: string;
  language?: string;
}

export interface TagCloudOptions {
  top?: number;
  signal?: AbortSignal;
}

export function getTagCloud(opts: TagCloudOptions = {}): Promise<TagCloudResponse> {
  const query: Record<string, unknown> = {};
  if (opts.top !== undefined) query.top = opts.top;
  return client<TagCloudResponse>("GET", "/api/tags/cloud", {
    query,
    signal: opts.signal,
  });
}

export function listTagOptions(signal?: AbortSignal): Promise<TagOptionsResponse> {
  return client<TagOptionsResponse>("GET", "/api/filter-options/tags", { signal });
}

export function getTag(
  id: number,
  query: TagQuery = {},
  signal?: AbortSignal,
): Promise<TagBooksResponse> {
  const q: Record<string, unknown> = {};
  if (query.authorIds !== undefined) q.authorIds = query.authorIds;
  if (query.seriesIds !== undefined) q.seriesIds = query.seriesIds;
  if (query.language !== undefined) q.language = query.language;
  return client<TagBooksResponse>("GET", `/api/tags/${id}`, { query: q, signal });
}

export function mapTag(id: number, name: string): Promise<MapTagResponse> {
  return client<MapTagResponse>("PUT", `/api/tags/${id}/map`, { body: { name } });
}
