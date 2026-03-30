export interface SimilarBook {
  title: string;
  authors: string;
  coverUrl: string;
  litresUrl: string;
  rating: number;
  ratingCount: number;
}

export interface SimilarBooksViewProps {
  books: SimilarBook[];
}
