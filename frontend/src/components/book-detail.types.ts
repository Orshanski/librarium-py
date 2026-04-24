import { RefObject } from "react";
import { Book } from "../types";
import type { Shelf } from "@/api/endpoints/shelves";
import type { ListOrigin } from "./breadcrumb-origin";

export type { Shelf } from "@/api/endpoints/shelves";

export interface BookDetailViewProps {
  book: Book;
  seriesBooks: Book[];
  bookOrigin: ListOrigin;
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
  hasOffline: boolean;
  offlineLoading: boolean;
  onToggleOffline: () => void;
  showOfflineToggle: boolean;
}
