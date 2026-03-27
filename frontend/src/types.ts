export interface BookFormat {
  format: string;
  size: string;
}

export interface Book {
  id: number;
  title: string;
  authors: string[];
  series: string | null;
  seriesNumber: number | null;
  tags: string[];
  rating: number | null; // 1-5
  language: string;
  coverPath: string;
  description: string | null;
  publisher: string | null;
  pubDate: string | null;
  formats: BookFormat[];
  isbn: string | null;
}

export interface Author {
  name: string;
  bookCount: number;
  tags: string[];
}

export interface Series {
  name: string;
  author: string;
  bookCount: number;
}

export interface Shelf {
  id: number;
  name: string;
  bookIds: number[];
}
