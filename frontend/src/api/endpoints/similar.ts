import { client } from "../client";
import type { SimilarBook } from "@/components/similar-books.types";

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
