import { Book } from "../types";

export interface BookCardProps {
  book: Book;
  onRemove?: () => void;
}
