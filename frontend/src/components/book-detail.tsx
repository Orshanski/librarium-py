import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Book } from "../types";
import { useCacheStatus } from "../hooks/useCacheStatus";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import ConfirmDialog from "./confirm-dialog";
import DesktopBookDetail from "./desktop/desktop-book-detail";
import MobileBookDetail from "./mobile/mobile-book-detail";
import { Shelf } from "./book-detail.types";
import type { ListOrigin } from "./breadcrumb-origin";
import { listShelves, addBookToShelf, removeBookFromShelf } from "@/api/endpoints/shelves";
import { getCover } from "@/api/endpoints/covers";
import {
  getBook,
  downloadBook as apiDownloadBook,
  setRating as apiSetRating,
  setRead as apiSetRead,
  deleteBook,
} from "@/api/endpoints/books";

export default function BookDetail({
  book,
  seriesBooks,
  bookOrigin,
}: {
  book: Book;
  seriesBooks: Book[];
  bookOrigin: ListOrigin;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = user?.role === "admin";
  const [rating, setRating] = useState<number | null>(book.rating);
  const [isRead, setIsRead] = useState(book.isRead);
  const [showShelfMenu, setShowShelfMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [shelfList, setShelfList] = useState<Shelf[] | null>(null);
  const [bookShelfIds, setBookShelfIds] = useState<Set<number>>(new Set());
  const shelfRef = useRef<HTMLDivElement>(null);
  const { cached: isCached, loading: cacheLoading, toggleCache, evict: evictFromCache, isPwa } = useCacheStatus(book.id);

  const handleToggleCache = useCallback(() => {
    toggleCache(
      { title: book.title, authors: book.authors, manuallyAdded: true },
      async () => {
        const data = await getBook(book.id);
        const allFiles = data.files || [];
        return Promise.all(
          allFiles.map(async (f) => {
            const fileBlob = await apiDownloadBook(book.id, f.format);
            return { format: f.format, fileBlob, fileSize: f.file_size };
          }),
        );
      },
      async () => {
        return getCover(book.id, true);
      },
    );
  }, [book.id, book.title, book.authors, toggleCache]);

  useEffect(() => {
    if (!showShelfMenu) return;
    function handleClick(e: PointerEvent) {
      if (shelfRef.current && !shelfRef.current.contains(e.target as Node)) {
        setShowShelfMenu(false);
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [showShelfMenu]);

  async function saveRating(nextRating: number) {
    const previous = rating;
    setRating(nextRating);
    try {
      await apiSetRating(book.id, nextRating);
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
      if (next) evictFromCache().catch((err) => console.warn("Failed to remove cached book:", err));
    } catch {
      setIsRead(previous);
    }
  }

  function toggleShelfMenu() {
    if (!showShelfMenu) {
      listShelves(book.id)
        .then((data) => {
          setShelfList(data.shelves);
          const onShelves = (data.bookShelves || []).filter((s) => s.has_book).map((s) => s.id);
          setBookShelfIds(new Set(onShelves));
        })
        .catch((err) => console.warn("Failed to load shelf list:", err));
    }
    setShowShelfMenu((value) => !value);
  }

  async function toggleShelfBook(shelfId: number) {
    if (bookShelfIds.has(shelfId)) {
      const previous = new Set(bookShelfIds);
      setBookShelfIds((prev) => {
        const next = new Set(prev);
        next.delete(shelfId);
        return next;
      });
      try {
        await removeBookFromShelf(shelfId, book.id);
      } catch {
        setBookShelfIds(previous);
      }
      return;
    }

    const previous = new Set(bookShelfIds);
    setBookShelfIds((prev) => new Set(prev).add(shelfId));
    try {
      await addBookToShelf(shelfId, book.id);
    } catch {
      setBookShelfIds(previous);
    }
  }

  const detailProps = {
    book,
    seriesBooks,
    bookOrigin,
    isAdmin,
    rating,
    isRead,
    showShelfMenu,
    shelfList,
    bookShelfIds,
    shelfRef,
    onChangeRating: saveRating,
    onToggleRead: toggleRead,
    onToggleShelfMenu: toggleShelfMenu,
    onToggleShelfBook: toggleShelfBook,
    onShowDeleteConfirm: () => setShowDeleteConfirm(true),
    isCached,
    cacheLoading,
    onToggleCache: handleToggleCache,
    showCacheToggle: isPwa,
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
              // После удаления — возврат на parent-список (source, откуда открыли книгу).
              // replace: true — чтобы системный жест "назад" не привёл на 404 удалённой книги.
              // Без state — sidebar-like переход, стек wipe'нется. Счётчик cacheVersion уже
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
