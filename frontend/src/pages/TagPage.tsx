import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getBreadcrumbUrl, saveBookOrigin } from "../utils/breadcrumb-state";

import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import TagAdminPanel from "../components/tag-admin-panel";
import { FilterKey, SelectedFilters } from "../components/smart-filter-bar";
import { selectedToApiParams } from "../api/filter-params";
import type { Book } from "../types";
import { useAuth } from "../auth";
import { colors } from "../theme";
import { useCachedBookIds } from "../hooks/useCachedBookIds";
import { getTag, type TagSummary } from "../api/endpoints/tags";
import { NotFoundError } from "@/api/errors";
import { SORT_CONFIG, sortOptionsFor } from "../config/sort";

function cacheKey(tagId: number) {
  return `librarium_tag_${tagId}_v3`;
}

function saveCache(tagId: number, tag: TagSummary, books: Book[], selected: SelectedFilters, sort: string) {
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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [tag, setTag] = useState<TagSummary | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState<SelectedFilters>({});
  const [showAdmin, setShowAdmin] = useState(false);

  const frozenRef = useRef(false);
  const restoredRef = useRef(false);

  const sort = searchParams.get("sort") || SORT_CONFIG.tag.default;
  const authorIds = selected.authorIds || [];
  const seriesIds = selected.seriesIds || [];
  const languages = selected.language || [];
  const paramsKey = `${tagId}|${sort}|${authorIds.join(",")}|${seriesIds.join(",")}|${languages.join(",")}`;

  useEffect(() => {
    if (tag) saveBookOrigin(tag.name, `/tags/${tagId}`);
  }, [tag, tagId]);

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

  useEffect(() => {
    if (restoredRef.current) {
      restoredRef.current = false;
      return;
    }
    if (isNaN(tagId)) return;

    setLoading(true);

    const controller = new AbortController();
    const apiParams = { ...selectedToApiParams(selected), sort };
    getTag(tagId, apiParams, controller.signal)
      .then((data) => {
        sessionStorage.removeItem(cacheKey(tagId));
        setTag(data.tag);
        setBooks(data.books);
      })
      .catch((err) => {
        if (err instanceof NotFoundError) {
          setNotFound(true);
        } else {
          console.warn("Failed to fetch tag:", err);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [paramsKey]);

  const stateRef = useRef({ tag, books, selected, sort });
  stateRef.current = { tag, books, selected, sort };

  useEffect(() => {
    if (tag && books.length > 0) saveCache(tagId, tag, books, selected, sort);
  }, [tag, books, selected, sort, tagId]);

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

  function onSelectionChange(key: FilterKey, values: string[]) {
    sessionStorage.removeItem(cacheKey(tagId));
    setSelected((prev) => ({ ...prev, [key]: values }));
  }

  function handleSortChange(newSort: string) {
    sessionStorage.removeItem(cacheKey(tagId));
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", newSort);
    navigate(`/tags/${tagId}?${params.toString()}`);
  }

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
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
        filterKeys={["authorIds", "seriesIds", "language"]}
        baseFilters={{ tagIds: [String(tagId)] }}
        selected={selected}
        onSelectionChange={onSelectionChange}
        sortOptions={sortOptionsFor("tag")}
        sortValue={sort}
        onSortChange={handleSortChange}
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
        {books.map((book) => (
          <BookCard key={book.id} book={book} isCached={cachedBookIds.has(book.id)} />
        ))}
        {books.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: 14, color: colors.textDim, padding: 24 }}>
            Книги не найдены
          </div>
        )}
      </BookGrid>
    </>
  );
}
