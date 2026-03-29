import { useState, useEffect, useRef } from "react";
import { Book } from "../types";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import ConfirmDialog from "./confirm-dialog";
import DesktopBookDetail from "./desktop/desktop-book-detail";
import MobileBookDetail from "./mobile/mobile-book-detail";
import { Shelf } from "./book-detail.types";

export default function BookDetail({
  book,
  seriesBooks,
}: {
  book: Book;
  seriesBooks: Book[];
}) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = user?.role === "admin";
  const [rating, setRating] = useState<number | null>(book.rating);
  const [isRead, setIsRead] = useState(false);
  const [showShelfMenu, setShowShelfMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [shelfList, setShelfList] = useState<Shelf[] | null>(null);
  const [bookShelfIds, setBookShelfIds] = useState<Set<number>>(new Set());
  const shelfRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    fetch(`/api/books/${book.id}/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.rating !== undefined) setRating(data.rating);
        setIsRead(!!data.is_read);
      })
      .catch(() => {});
  }, [book.id]);

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
    } catch {
      setIsRead(previous);
    }
  }

  function toggleShelfMenu() {
    if (!showShelfMenu) {
      fetch(`/api/shelves?bookId=${book.id}`)
        .then((r) => r.json())
        .then((data) => {
          setShelfList(data.shelves || []);
          const onShelves = (data.bookShelves || []).filter((s: Shelf) => s.has_book).map((s: Shelf) => s.id);
          setBookShelfIds(new Set(onShelves));
        });
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
        const res = await fetch(`/api/shelves/${shelfId}/books/${book.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("remove shelf failed");
      } catch {
        setBookShelfIds(previous);
      }
      return;
    }

    const previous = new Set(bookShelfIds);
    setBookShelfIds((prev) => new Set(prev).add(shelfId));
    try {
      const res = await fetch(`/api/shelves/${shelfId}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id }),
      });
      if (!res.ok) throw new Error("add shelf failed");
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
              sessionStorage.removeItem("librarium_catalog");
              window.location.href = "/";
            }
          }}
        />
      )}
    </>
  );
}
