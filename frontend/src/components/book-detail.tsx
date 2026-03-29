import { useState, useEffect, useRef } from "react";
import { Book } from "../types";
import { useAuth } from "../auth";
import { useIsMobile } from "../responsive";
import ConfirmDialog from "./confirm-dialog";
import DesktopBookDetail from "./desktop/desktop-book-detail";
import MobileBookDetail from "./mobile/mobile-book-detail";

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
  const [shelfList, setShelfList] = useState<any[] | null>(null);
  const [bookShelfIds, setBookShelfIds] = useState<Set<number>>(new Set());
  const shelfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showShelfMenu) return;
    function handleClick(e: MouseEvent) {
      if (shelfRef.current && !shelfRef.current.contains(e.target as Node)) {
        setShowShelfMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  function saveRating(nextRating: number) {
    setRating(nextRating);
    fetch(`/api/books/${book.id}/rating`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: nextRating }),
    });
  }

  function toggleRead() {
    const next = !isRead;
    setIsRead(next);
    fetch(`/api/books/${book.id}/read`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: next }),
    });
  }

  function toggleShelfMenu() {
    if (!showShelfMenu) {
      fetch(`/api/shelves?bookId=${book.id}`)
        .then((r) => r.json())
        .then((data) => {
          setShelfList(data.shelves || []);
          const onShelves = (data.bookShelves || []).filter((s: any) => s.has_book).map((s: any) => s.id);
          setBookShelfIds(new Set(onShelves));
        });
    }
    setShowShelfMenu((value) => !value);
  }

  async function toggleShelfBook(shelfId: number) {
    if (bookShelfIds.has(shelfId)) {
      await fetch(`/api/shelves/${shelfId}/books/${book.id}`, { method: "DELETE" });
      setBookShelfIds((prev) => {
        const next = new Set(prev);
        next.delete(shelfId);
        return next;
      });
      return;
    }

    await fetch(`/api/shelves/${shelfId}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: book.id }),
    });
    setBookShelfIds((prev) => new Set(prev).add(shelfId));
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
