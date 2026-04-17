import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Book } from "../types";
import { invalidateAllCaches } from "../utils/catalog-cache";
import { useCacheStatus } from "../hooks/useCacheStatus";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import ConfirmDialog from "./confirm-dialog";
import DesktopBookDetail from "./desktop/desktop-book-detail";
import MobileBookDetail from "./mobile/mobile-book-detail";
import { Shelf } from "./book-detail.types";
import { listShelves, addBookToShelf, removeBookFromShelf } from "@/api/endpoints/shelves";

export default function BookDetail({
  book,
  seriesBooks,
}: {
  book: Book;
  seriesBooks: Book[];
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
        const resp = await fetch(`/api/books/${book.id}`, { credentials: "include" });
        const data: { files: { format: string; file_size: number }[] } = await resp.json();
        const allFiles = data.files || [];
        return Promise.all(allFiles.map(async (f: { format: string; file_size: number }) => {
          const r = await fetch(`/api/books/${book.id}/download?format=${f.format}`, { credentials: "include" });
          return { format: f.format, fileBlob: await r.blob(), fileSize: f.file_size };
        }));
      },
      async () => {
        const r = await fetch(`/api/covers/${book.id}?full=1`, { credentials: "include" });
        return r.blob();
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
      const res = await fetch(`/api/books/${book.id}/rating`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: nextRating }),
      });
      if (!res.ok) throw new Error("save rating failed");
    } catch {
      setRating(previous ?? null);
    }
  }

  async function toggleRead() {
    const next = !isRead;
    const previous = isRead;
    setIsRead(next);
    try {
      const res = await fetch(`/api/books/${book.id}/read`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: next }),
      });
      if (!res.ok) throw new Error("toggle read failed");
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
            const res = await fetch(`/api/books/${book.id}`, { method: "DELETE" });
            if (res.ok) {
              invalidateAllCaches();
              navigate(-1);
            }
          }}
        />
      )}
    </>
  );
}
