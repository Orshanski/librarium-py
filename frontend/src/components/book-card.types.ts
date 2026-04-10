import { Book } from "../types";

export interface BookCardProps {
  book: Book;
  onRemove?: () => void;
  href?: string;
  onClick?: () => void;
  progressPercent?: number;
  isCached?: boolean;
}
