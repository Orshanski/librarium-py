import { RefObject } from "react";
import { Book } from "../types";

export interface Shelf {
  id: number;
  name: string;
  is_system: boolean;
  has_book?: boolean;
}

export interface BookDetailViewProps {
  book: Book;
  seriesBooks: Book[];
  isAdmin: boolean;
  rating: number | null;
  isRead: boolean;
  showShelfMenu: boolean;
  shelfList: Shelf[] | null;
  bookShelfIds: Set<number>;
  shelfRef: RefObject<HTMLDivElement | null>;
  onChangeRating: (rating: number) => void;
  onToggleRead: () => void;
  onToggleShelfMenu: () => void;
  onToggleShelfBook: (shelfId: number) => Promise<void>;
  onShowDeleteConfirm: () => void;
  isCached: boolean;
  cacheLoading: boolean;
  onToggleCache: () => void;
  showCacheToggle: boolean;
}
