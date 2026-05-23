import { client } from "../client";

export interface SimilarBook {
  title: string;
  authors: string;
  coverUrl: string;
  litresUrl: string;
  rating: number;
  ratingCount: number;
}

export interface SimilarResponse {
  books: SimilarBook[];
  source: string;
  error: string | null; // business-state; null on success
}

export function getSimilar(
  id: number,
  signal?: AbortSignal,
): Promise<SimilarResponse> {
  return client<SimilarResponse>("GET", `/api/books/${id}/similar`, { signal });
}
