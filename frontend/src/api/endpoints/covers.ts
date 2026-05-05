import { client, type ClientQuery } from "../client";
import type { OkResponse } from "../types";

export interface CoverUploadResponse {
  ok: true;
  tempCoverUrl: string;
}

export function getCover(id: number, full?: boolean, signal?: AbortSignal): Promise<Blob> {
  const query: ClientQuery = {};
  if (full) query.full = 1;
  return client<Blob>("GET", `/api/covers/${id}`, { query, blob: true, signal });
}

export function uploadCover(
  bookId: number,
  file: Blob | File,
  filename?: string,
): Promise<CoverUploadResponse> {
  const form = new FormData();
  form.append("file", file, filename);
  return client<CoverUploadResponse>("POST", `/api/books/${bookId}/cover`, { body: form });
}

export function discardCover(bookId: number): Promise<OkResponse> {
  return client<OkResponse>("DELETE", `/api/books/${bookId}/cover`);
}
