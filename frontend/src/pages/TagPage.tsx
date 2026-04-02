import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBreadcrumbUrl, saveBookOrigin } from "../utils/breadcrumb-state";
import Shell from "../components/shell";
import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import TagAdminPanel from "../components/tag-admin-panel";
import { FilterConfig } from "../components/filter-bar";
import { RawBook, toBook } from "../types";
import { useAuth } from "../auth";
import { colors } from "../theme";

interface TagData {
  id: number;
  name: string;
  code: string | null;
  book_count: number;
}

function applyFilters(allBooks: Book[], selected: Record<string, string[]>, excludeKey?: string): Book[] {
  return allBooks.filter((book) => {
    for (const [key, values] of Object.entries(selected)) {
      if (key === excludeKey || values.length === 0) continue;
      if (key === "author" && !book.authors.some((a) => values.includes(a))) return false;
      if (key === "series" && (!book.series || !values.includes(book.series))) return false;
      if (key === "language" && !values.includes(book.language)) return false;
    }
    return true;
  });
}

function buildOptions(filteredBooks: Book[], key: string): { value: string; count: number }[] {
  const map = new Map<string, number>();
  for (const book of filteredBooks) {
    if (key === "author") {
      for (const a of book.authors) map.set(a, (map.get(a) || 0) + 1);
    } else if (key === "series") {
      if (book.series) map.set(book.series, (map.get(book.series) || 0) + 1);
    } else if (key === "language") {
      map.set(book.language, (map.get(book.language) || 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

const filterKeys = [
  { key: "author", label: "Автор" },
  { key: "series", label: "Серия" },
  { key: "language", label: "Язык" },
];

function cacheKey(tagId: number) {
  return `librarium_tag_${tagId}`;
}

function saveCache(tagId: number, tag: TagData, tagBooks: Book[], selected: Record<string, string[]>, sort: string) {
  try {
    const main = document.querySelector("main");
    sessionStorage.setItem(cacheKey(tagId), JSON.stringify({
      tag,
      tagBooks,
      selected,
      sort,
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
    if (!data.tag || !data.tagBooks?.length) return null;
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
  const [tagBooks, setTagBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState("added_desc");
  const [showAdmin, setShowAdmin] = useState(false);

  const frozenRef = useRef(false);

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
      setTagBooks(cached.tagBooks);
      if (cached.selected) setSelected(cached.selected);
      if (cached.sort) setSort(cached.sort);
      setLoading(false);
      frozenRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const main = document.querySelector("main");
          if (main) main.scrollTop = cached.scrollTop;
          setTimeout(() => { frozenRef.current = false; }, 200);
        });
      });
      return;
    }

    fetch(`/api/tags/${tagId}`)
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
        setTagBooks(data.books.map(toBook));
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [tagId]);

  // Scroll listener — saves cache on scroll
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main || !tag) return;

    function onScroll() {
      if (tag) saveCache(tagId, tag, tagBooks, selected, sort);
    }

    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
    };
  }, [tag, tagBooks, selected, sort, tagId]);

  const filterConfigs: FilterConfig[] = useMemo(() => {
    return filterKeys.map(({ key, label }) => ({
      key,
      label,
      options: buildOptions(applyFilters(tagBooks, selected, key), key),
    }));
  }, [selected, tagBooks]);

  const filtered = useMemo(() => {
    const books = applyFilters(tagBooks, selected);
    switch (sort) {
      case "title_asc": return [...books].sort((a, b) => a.title.localeCompare(b.title, "ru"));
      case "title_desc": return [...books].sort((a, b) => b.title.localeCompare(a.title, "ru"));
      case "author_asc": return [...books].sort((a, b) => (a.authors[0] || "").split(" ").pop()!.localeCompare((b.authors[0] || "").split(" ").pop()!, "ru"));
      case "rating_desc": return [...books].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      default: return books;
    }
  }, [selected, tagBooks, sort]);

  const sortOptions = [
    { key: "added_desc", label: "По дате добавления" },
    { key: "title_asc", label: "По названию А→Я" },
    { key: "title_desc", label: "По названию Я→А" },
    { key: "author_asc", label: "По автору А→Я" },
    { key: "rating_desc", label: "По рейтингу" },
  ];

  function onSelectionChange(key: string, values: string[]) {
    sessionStorage.removeItem(cacheKey(tagId));
    setSelected((prev) => ({ ...prev, [key]: values }));
  }

  if (loading) {
    return (
      <Shell>
        <PageHeader title="..." breadcrumb={{ label: "Жанры", href: getBreadcrumbUrl("tags", "/tags") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </Shell>
    );
  }

  if (notFound || !tag) {
    return (
      <Shell>
        <PageHeader title="Жанр не найден" breadcrumb={{ label: "Жанры", href: getBreadcrumbUrl("tags", "/tags") }} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Жанр не найден</div>
      </Shell>
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
    <Shell>
      <PageHeader
        title={tag.name}
        titleSlot={adminButton}
        mobileActionSlot={adminButton}
        breadcrumb={{ label: "Жанры", href: getBreadcrumbUrl("tags", "/tags") }}
        filters={filterConfigs}
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
        {filtered.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: 14, color: colors.textDim, padding: 24 }}>
            Книги не найдены
          </div>
        )}
      </BookGrid>
    </Shell>
  );
}
