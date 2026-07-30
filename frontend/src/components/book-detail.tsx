import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Book, BookDetail, BookFormat } from "../types";
import { useOfflineBookStatus } from "../hooks/useOfflineBookStatus";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import ConfirmDialog from "./confirm-dialog";
import DesktopBookDetail from "./desktop/desktop-book-detail";
import MobileBookDetail from "./mobile/mobile-book-detail";
import type { ListOrigin } from "./breadcrumb-origin";
import { getCover } from "@/api/endpoints/covers";
import {
  getBook,
  downloadBook as apiDownloadBook,
  setRating as apiSetRating,
  setRead as apiSetRead,
  deleteBook,
} from "@/api/endpoints/books";
import { domainEvents } from "@/domain/events";

export default function BookDetail({
  book,
  seriesBooks,
  offlineSeriesBookIds,
  formats,
  isbn,
  bookOrigin,
}: Readonly<{
  book: BookDetail;
  seriesBooks: Book[];
  offlineSeriesBookIds: Set<number>;
  formats: BookFormat[];
  isbn: string | null;
  bookOrigin: ListOrigin;
}>) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = user?.role === "admin";
  const [rating, setRating] = useState<number | null>(book.rating);
  const [isRead, setIsRead] = useState(book.isRead);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { hasOffline, loading: offlineLoading, toggleOffline, evict: evictOffline, isPwa } = useOfflineBookStatus(book.id);

  const handleToggleOffline = useCallback(() => {
    toggleOffline(
      book,
      true,
      async () => {
        const data = await getBook(book.id);
        const allFiles = data.files || [];
        return Promise.all(
          allFiles.map(async (f) => {
            const fileBlob = await apiDownloadBook(book.id, f.format);
            return { format: f.format, fileBlob, fileSize: f.fileSize ?? 0 };
          }),
        );
      },
      async () => {
        return getCover(book.id, true);
      },
    );
  }, [book, toggleOffline]);

  async function saveRating(nextRating: number) {
    const previous = rating;
    setRating(nextRating);
    try {
      await apiSetRating(book.id, nextRating);
      domainEvents.publish("bookRatingChanged", { bookId: book.id, rating: nextRating });
    } catch {
      setRating(previous ?? null);
    }
  }

  async function toggleRead() {
    const next = !isRead;
    const previous = isRead;
    setIsRead(next);
    try {
      await apiSetRead(book.id, next);
      domainEvents.publish("bookReadChanged", { bookId: book.id, isRead: next });
      if (next) evictOffline().catch((err) => console.warn("Failed to remove offline book:", err));
    } catch {
      setIsRead(previous);
    }
  }

  const detailProps = {
    book,
    seriesBooks,
    offlineSeriesBookIds,
    formats,
    isbn,
    bookOrigin,
    isAdmin,
    rating,
    isRead,
    onChangeRating: saveRating,
    onToggleRead: toggleRead,
    onShowDeleteConfirm: () => setShowDeleteConfirm(true),
    hasOffline,
    offlineLoading,
    onToggleOffline: handleToggleOffline,
    showOfflineToggle: isPwa,
  };

  return (
    <>
      {isMobile ? <MobileBookDetail {...detailProps} /> : <DesktopBookDetail {...detailProps} />}

      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Удалить «${book.title}»?`}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={async () => {
            try {
              await deleteBook(book.id);
              domainEvents.publish("bookDeleted", { bookId: book.id });
              // После удаления — возврат на parent-список (source, откуда открыли книгу).
              // replace: true — чтобы системный жест "назад" не привёл на 404 удалённой книги.
              // Без state — sidebar-like переход, стек wipe'нется. Scroll-counter уже
              // инкрементирован через DELETE, stale записи сами игнорируются.
              navigate(bookOrigin.url, { replace: true });
            } catch (err: unknown) {
              if (err instanceof Error && err.name === "AbortError") return;
              console.warn("Failed to delete book:", err);
              alert("Не удалось удалить книгу");
            } finally {
              setShowDeleteConfirm(false);
            }
          }}
        />
      )}
    </>
  );
}
