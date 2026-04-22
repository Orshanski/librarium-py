export type ListOrigin =
  | { type: "catalog"; url: string; label: string }
  | { type: "author"; url: string; label: string }
  | { type: "series"; url: string; label: string }
  | { type: "tag"; url: string; label: string }
  | { type: "shelf"; url: string; label: string }
  | { type: "search"; url: string; label: string };

export type BookContextOrigin = {
  type: "book";
  url: string;
  label: string;
  bookOrigin: ListOrigin;
};

export type BookOrigin = ListOrigin | BookContextOrigin;
