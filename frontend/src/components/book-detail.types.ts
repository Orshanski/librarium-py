import { Book } from "../types";
import type { ListOrigin } from "./breadcrumb-origin";

export interface BookDetailViewProps {
  book: Book;
  seriesBooks: Book[];
  bookOrigin: ListOrigin;
  isAdmin: boolean;
  rating: number | null;
  isRead: boolean;
  onChangeRating: (rating: number) => void;
  onToggleRead: () => void;
  onShowDeleteConfirm: () => void;
  hasOffline: boolean;
  offlineLoading: boolean;
  onToggleOffline: () => void;
  showOfflineToggle: boolean;
}
