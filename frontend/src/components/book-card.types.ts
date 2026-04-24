import { Book } from "../types";
import type { BookOrigin } from "./breadcrumb-origin";

export interface BookCardProps {
  book: Book;
  onRemove?: () => void;
  href?: string;
  onClick?: () => void;
  progressPercent?: number;
  hasOffline?: boolean;
  linkState?: { origin: BookOrigin };
}
