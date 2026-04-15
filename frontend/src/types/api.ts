export interface BookApiResponse {
  book: {
    title: string;
    authors: string;
    id: number;
    is_read?: boolean;
    [key: string]: unknown;
  };
  files: { format: string; file_size: number }[];
  [key: string]: unknown;
}
