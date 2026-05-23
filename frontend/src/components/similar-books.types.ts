import type { SimilarBook } from "@/api/endpoints/similar";

export type { SimilarBook };

export interface SimilarBooksViewProps {
  books: SimilarBook[];
}
