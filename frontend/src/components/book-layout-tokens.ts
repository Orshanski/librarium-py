export interface BookGridTokens {
  columns: string;
  gap: string | number;
  alignItems?: string;
}

export interface BookRailTokens {
  itemWidth: string;
  gap: string | number;
}

export const DESKTOP_BOOK_GRID: BookGridTokens = {
  columns: "repeat(auto-fill, 150px)",
  gap: 24,
};

export const MOBILE_BOOK_GRID: BookGridTokens = {
  columns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  alignItems: "start",
};

export const DESKTOP_BOOK_RAIL: BookRailTokens = {
  itemWidth: "150px",
  gap: 24,
};

export const MOBILE_BOOK_RAIL: BookRailTokens = {
  itemWidth: "calc((100% - 24px) / 3)",
  gap: 12,
};
