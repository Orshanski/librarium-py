import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { colors } from "../theme";
import {
  addBookToShelf,
  listShelves,
  removeBookFromShelf,
  type Shelf,
} from "@/api/endpoints/shelves";
import BookActionButton from "./book-action-button";
import ShelfDropdownMenu from "./shelf-dropdown-menu";

interface BookShelfMenuProps {
  bookId: number;
  compact: boolean;
}

const ROOT_STYLE: CSSProperties = { position: "relative" };

const DROPDOWN_STYLE: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  zIndex: 50,
  backgroundColor: colors.sidebar,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  padding: "6px 0",
  marginTop: 6,
};

export default function BookShelfMenu({ bookId, compact }: Readonly<BookShelfMenuProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const loadRequestId = useRef(0);
  const mutationRequestIds = useRef<Map<number, number>>(new Map());
  const menuId = useId();

  async function loadShelves() {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    try {
      const data = await listShelves(bookId);
      if (loadRequestId.current !== requestId) return;
      setShelves(data.shelves);
      const onShelves = (data.bookShelves ?? [])
        .filter((shelf) => shelf.hasBook)
        .map((shelf) => shelf.id);
      setSelectedIds(new Set(onShelves));
    } catch (err) {
      console.warn("Failed to load shelf list:", err);
    }
  }

  function handleToggle() {
    if (!isOpen) void loadShelves();
    setIsOpen((value) => !value);
  }

  async function handleToggleShelf(shelfId: number) {
    const mutationId = (mutationRequestIds.current.get(shelfId) ?? 0) + 1;
    mutationRequestIds.current.set(shelfId, mutationId);
    const wasOnShelf = selectedIds.has(shelfId);
    const previous = new Set(selectedIds);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (wasOnShelf) next.delete(shelfId);
      else next.add(shelfId);
      return next;
    });

    try {
      if (wasOnShelf) await removeBookFromShelf(shelfId, bookId);
      else await addBookToShelf(shelfId, bookId);
    } catch {
      if (mutationRequestIds.current.get(shelfId) === mutationId) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (previous.has(shelfId)) next.add(shelfId);
          else next.delete(shelfId);
          return next;
        });
      }
    } finally {
      if (mutationRequestIds.current.get(shelfId) === mutationId) {
        mutationRequestIds.current.delete(shelfId);
      }
    }
  }

  useEffect(() => {
    loadRequestId.current += 1;
    mutationRequestIds.current.clear();
    setIsOpen(false);
    setShelves(null);
    setSelectedIds(new Set());
  }, [bookId]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, [isOpen]);

  return (
    <div ref={rootRef} style={ROOT_STYLE}>
      <BookActionButton
        kind="button"
        variant="accent"
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={isOpen && shelves !== null ? menuId : undefined}
      >
        На полку
      </BookActionButton>
      {isOpen && shelves !== null && (
        <div id={menuId} style={DROPDOWN_STYLE}>
          <ShelfDropdownMenu
            shelves={shelves}
            selectedIds={selectedIds}
            onToggleShelf={handleToggleShelf}
            compact={compact}
          />
        </div>
      )}
    </div>
  );
}
