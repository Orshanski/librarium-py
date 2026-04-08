import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBreadcrumbUrl, saveBookOrigin } from "../utils/breadcrumb-state";

import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import TagAdminPanel from "../components/tag-admin-panel";
import { FilterKey, SelectedFilters } from "../components/smart-filter-bar";
import { Book, RawBook, toBook } from "../types";
import { useAuth } from "../auth";
import { colors } from "../theme";
import { useCachedBookIds } from "../hooks/useCachedBookIds";

interface TagData {
  id: number;
  name: string;
  code: string | null;
  book_count: number;
}

function cacheKey(tagId: number) {
  return `librarium_tag_${tagId}`;
}

function saveCache(tagId: number, tag: TagData, books: Book[], selected: Record<string, string[]>, sort: string) {
  try {
    const main = document.querySelector("main");
    sessionStorage.setItem(cacheKey(tagId), JSON.stringify({
      tag, books, selected, sort,
      scrollTop: main?.scrollTop || 0,
    }));
    saveBookOrigin(tag.name, `/tags/${tagId}`);
  } catch {}
}

function loadCache(tagId: number) {
  try {
    const raw = sessionStorage.getItem(cacheKey(tagId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.tag || !data.books?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export default function TagPage() {
  const { id } = useParams();
  const tagId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tag, setTag] = useState<TagData | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState("added_desc");
  const [showAdmin, setShowAdmin] = useState(false);

  const frozenRef = useRef(false);
  const restoredRef = useRef(false);

  const authorFilter = selected.author || [];
  const seriesFilter = selected.series || [];
  const langFilter = selected.language || [];
  const paramsKey = `${tagId}|${authorFilter.join(",")}|${seriesFilter.join(",")}|${langFilter.join(",")}`;

  useEffect(() => {
    if (tag) saveBookOrigin(tag.name, `/tags/${tagId}`);
  }, [tag, tagId]);

  // Restore from cache on mount
  useEffect(() => {
    if (isNaN(tagId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const cached = loadCache(tagId);
    if (cached) {
      setTag(cached.tag);
      setBooks(cached.books);
      if (cached.selected) setSelected(cached.selected);
      if (cached.sort) setSort(cached.sort);
      setLoading(false);
      restoredRef.current = true;
      frozenRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const main = document.querySelector("main");
          if (main) main.scrollTop = cached.scrollTop;
          setTimeout(() => { frozenRef.current = false; }, 200);
        });
      });
    }
  }, [tagId]);

  // Fetch on mount or filter change
  useEffect(() => {
    if (restoredRef.current) {
      restoredRef.current = false;
      return;
    }
    if (isNaN(tagId)) return;

    setLoading(true);
    sessionStorage.removeItem(cacheKey(tagId));

    const params = new URLSearchParams();
    if (authorFilter.length > 0) params.set("authorIds", authorFilter.join(","));
    if (seriesFilter.length > 0) params.set("seriesIds", seriesFilter.join(","));
    if (langFilter.length > 0) params.set("language", langFilter[0]);

    fetch(`/api/tags/${tagId}?${params.toString()}`)
      .then((r) => {
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setTag(data.tag);
        setBooks(data.books.map(toBook));
      })
      .catch((err) => console.warn("Failed to fetch tag:", err))
      .finally(() => setLoading(false));
  }, [paramsKey]);

  // Save cache on data/filter change and on unmount
  const stateRef = useRef({ tag, books, selected, sort });
  stateRef.current = { tag, books, selected, sort };

  useEffect(() => {
    if (tag && books.length > 0) saveCache(tagId, tag, books, selected, sort);
  }, [tag, books, selected, sort, tagId]);

  // Scroll listener
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    function onScroll() {
      const s = stateRef.current;
      if (s.tag) saveCache(tagId, s.tag, s.books, s.selected, s.sort);
    }

    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
      const s = stateRef.current;
      if (s.tag && s.books.length > 0) saveCache(tagId, s.tag, s.books, s.selected, s.sort);
    };
  }, [tagId]);

  // Client-side sort (books already filtered by backend)
  const sorted = useMemo(() => {
    switch (sort) {
      case "title_asc": return [...books].sort((a, b) => a.title.localeCompare(b.title, "ru"));
      case "title_desc": return [...books].sort((a, b) => b.title.localeCompare(a.title, "ru"));
      case "author_asc": return [...books].sort((a, b) => (a.authors[0] || "").split(" ").pop()!.localeCompare((b.authors[0] || "").split(" ").pop()!, "ru"));
      case "rating_desc": return [...books].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      default: return books;
    }
  }, [books, sort]);

  const sortOptions = [
    { key: "added_desc", label: "По дате добавления" },
    { key: "title_asc", label: "По названию А→Я" },
    { key: "title_desc", label: "По названию Я→А" },
    { key: "author_asc", label: "По автору А→Я" },
    { key: "rating_desc", label: "По рейтингу" },
  ];

  function onSelectionChange(key: FilterKey, values: string[]) {
    sessionStorage.removeItem(cacheKey(tagId));
    setSelected((prev) => ({ ...prev, [key]: values }));
  }

  const bookIds = useMemo(() => sorted.map((b) => b.id), [sorted]);
  const cachedBookIds = useCachedBookIds(bookIds);

  if (loading) {
    return (
      <>
        <PageHeader title="..." breadcrumb={{ label: "Жанры", href: getBreadcrumbUrl("tags", "/tags") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (notFound || !tag) {
    return (
      <>
        <PageHeader title="Жанр не найден" breadcrumb={{ label: "Жанры", href: getBreadcrumbUrl("tags", "/tags") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Жанр не найден</div>
      </>
    );
  }

  const adminButton = user?.role === "admin" ? (
    <button
      onClick={() => setShowAdmin(!showAdmin)}
      style={{
        marginLeft: 12,
        padding: 0,
        background: "transparent",
        border: "none",
        color: colors.accent,
        fontSize: 22,
        cursor: "pointer",
        lineHeight: 1,
      }}
      aria-label="Управление жанром"
    >⚙</button>
  ) : undefined;

  return (
    <>
      <PageHeader
        title={tag.name}
        titleSlot={adminButton}
        mobileActionSlot={adminButton}
        breadcrumb={{ label: "Жанры", href: getBreadcrumbUrl("tags", "/tags") }}
        filterKeys={["author", "series", "language"]}
        baseFilters={{ tagIds: [String(tagId)] }}
        selected={selected}
        onSelectionChange={onSelectionChange}
        sortOptions={sortOptions}
        sortValue={sort}
        onSortChange={(s) => {
          sessionStorage.removeItem(cacheKey(tagId));
          setSort(s);
        }}
      />

      {showAdmin && tag && (
        <TagAdminPanel
          tagId={tag.id}
          currentName={tag.name}
          onMapped={(targetId, newName) => {
            if (targetId !== tag.id) {
              navigate(`/tags/${targetId}`);
            } else {
              setTag({ ...tag, name: newName });
              setShowAdmin(false);
            }
          }}
        />
      )}

      <BookGrid>
        {sorted.map((book) => (
          <BookCard key={book.id} book={book} isCached={cachedBookIds.has(book.id)} />
        ))}
        {sorted.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: 14, color: colors.textDim, padding: 24 }}>
            Книги не найдены
          </div>
        )}
      </BookGrid>
    </>
  );
}
