import { RefObject } from "react";
import { Book } from "../types";

export interface BookDetailViewProps {
  book: Book;
  seriesBooks: Book[];
  isAdmin: boolean;
  rating: number | null;
  isRead: boolean;
  showShelfMenu: boolean;
  shelfList: any[] | null;
  bookShelfIds: Set<number>;
  shelfRef: RefObject<HTMLDivElement | null>;
  onChangeRating: (rating: number) => void;
  onToggleRead: () => void;
  onToggleShelfMenu: () => void;
  onToggleShelfBook: (shelfId: number) => Promise<void>;
  onShowDeleteConfirm: () => void;
}
