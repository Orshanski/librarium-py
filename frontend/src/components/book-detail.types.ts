import { Book, BookDetail, BookFormat } from "../types";
import type { ListOrigin } from "./breadcrumb-origin";

export interface BookDetailViewProps {
  book: BookDetail;
  /** Books in the same series — card-level. */
  seriesBooks: Book[];
  /** Книги серии, сохранённые офлайн, — для бейджа на карточках рельсы.
   *  Не путать с hasOffline ниже: тот про саму открытую книгу. */
  offlineSeriesBookIds: ReadonlySet<number>;
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
