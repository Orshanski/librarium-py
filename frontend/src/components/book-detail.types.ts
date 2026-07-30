import { Book, BookDetail, BookFormat } from "../types";
import type { ListOrigin } from "./breadcrumb-origin";

export interface BookDetailViewProps {
  book: BookDetail;
  /** Books in the same series — card-level. */
  seriesBooks: Book[];
  offlineSeriesBookIds: Set<number>;
  /** Available file formats — wire field BookDetailResponse.files reshaped. */
  formats: BookFormat[];
  /** Book ISBN — wire field BookDetailResponse.identifiers, picked. */
  isbn: string | null;
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
