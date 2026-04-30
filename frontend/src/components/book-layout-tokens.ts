export interface BookGridTokens {
  columns: string;
  gap: string | number;
  alignItems?: string;
}

export const DESKTOP_BOOK_GRID_COLUMN_WIDTH_PX = 150;
export const DESKTOP_BOOK_GRID_GAP_PX = 24;

export const MOBILE_BOOK_GRID_COLUMNS = 3;
export const MOBILE_BOOK_GRID_GAP_PX = 12;

export const DESKTOP_BOOK_GRID: BookGridTokens = {
  columns: `repeat(auto-fill, ${DESKTOP_BOOK_GRID_COLUMN_WIDTH_PX}px)`,
  gap: DESKTOP_BOOK_GRID_GAP_PX,
};

export const MOBILE_BOOK_GRID: BookGridTokens = {
  columns: `repeat(${MOBILE_BOOK_GRID_COLUMNS}, minmax(0, 1fr))`,
  gap: MOBILE_BOOK_GRID_GAP_PX,
  alignItems: "start",
};
