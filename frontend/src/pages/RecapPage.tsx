import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";

import PageHeader from "../components/page-header";
import LoadFailureNotice from "../components/load-failure-notice";
import RecapDocumentView, {
  RecapRetellView,
  recapPartAnchorId,
  recapSectionAnchorId,
} from "../components/recap-document";
import { readOriginFromState } from "../components/breadcrumb-origin";
import { colors, fonts, layout } from "../theme";
import { useIsMobile } from "../responsive";
import { getBook } from "../api/endpoints/books";
import { fetchRecap, type RecapDocument } from "../api/endpoints/recap";
import { NotFoundError } from "@/api/errors";
import { metadataCache, useCachedResource } from "@/cache";

type Tab = "recap" | "retell";

interface TocEntry {
  index: number;
  label: string;
}

function TableOfContents({
  caption,
  entries,
  activeIndex,
  isMobile,
  onJump,
}: Readonly<{
  caption: string;
  entries: TocEntry[];
  activeIndex: number;
  isMobile: boolean;
  onJump: (index: number) => void;
}>) {
  if (isMobile) {
    return (
      <nav
        aria-label={caption}
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          padding: "10px 0",
        }}
      >
        {entries.map((entry) => (
          <button
            key={entry.index}
            type="button"
            onClick={() => onJump(entry.index)}
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: 14,
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: activeIndex === entry.index ? "rgba(249, 190, 3, 0.14)" : "rgba(255, 255, 255, 0.06)",
              border: `1px solid ${activeIndex === entry.index ? colors.accent : colors.border}`,
              color: activeIndex === entry.index ? colors.accent : colors.textSecondary,
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={caption} style={{ width: 196, flexShrink: 0 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: colors.textDim, marginBottom: 10 }}>
        {caption}
      </div>
      {entries.map((entry) => (
        <a
          key={entry.index}
          onClick={(e) => { e.preventDefault(); onJump(entry.index); }}
          href={`#${entry.index}`}
          style={{
            display: "block",
            padding: "7px 10px",
            fontSize: 13,
            lineHeight: 1.35,
            cursor: "pointer",
            textDecoration: "none",
            borderLeft: `2px solid ${activeIndex === entry.index ? colors.accent : "transparent"}`,
            background: activeIndex === entry.index ? "rgba(249, 190, 3, 0.06)" : "transparent",
            color: activeIndex === entry.index ? colors.accent : colors.textSecondary,
          }}
        >
          {entry.label}
        </a>
      ))}
    </nav>
  );
}

export default function RecapPage() {
  const { id } = useParams();
  const location = useLocation();
  const isMobile = useIsMobile();
  const bookId = Number(id);

  const bookResource = useCachedResource(
    metadataCache,
    `book/${bookId}`,
    "detail",
    (signal) => (
      !id || Number.isNaN(bookId)
        ? Promise.reject(new NotFoundError(404, "Not found"))
        : getBook(bookId, signal)
    ),
  );
  const book = bookResource.data?.book ?? null;
  const bookLoading = bookResource.loading;

  const [doc, setDoc] = useState<RecapDocument | null>(null);
  const [docLoading, setDocLoading] = useState(true);
  const [docError, setDocError] = useState(false);
  const [tab, setTab] = useState<Tab>("recap");
  const [activeIndex, setActiveIndex] = useState(0);

  const recapPath = book?.recapPath ?? null;

  useEffect(() => {
    if (!recapPath) {
      setDoc(null);
      setDocLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setDocLoading(true);
    setDocError(false);
    fetchRecap(recapPath, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setDoc(data);
        setDocLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setDocError(true);
        setDocLoading(false);
      });
    return () => controller.abort();
  }, [recapPath]);

  // Закреплённая полоса вкладок (+ лента разделов на телефоне): измеряем её
  // высоту, чтобы оглавление слева знало, где ему прилипать под ней.
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [stickyHeight, setStickyHeight] = useState(0);
  // No dependency array on purpose: unlike PageHeader's header element, this
  // sticky wrapper only exists once `doc` has loaded, so the effect must
  // re-run on every render to catch the ref becoming available.
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return undefined;
    const update = () => setStickyHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  });

  // Подсветка текущего раздела при прокрутке: сравниваем верх каждого раздела
  // с нижней кромкой закреплённой полосы внутри скролл-контейнера страницы.
  const sectionRefs = useRef<Map<number, HTMLElement>>(new Map());
  const registerSectionRef = (index: number, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(index, el);
    else sectionRefs.current.delete(index);
  };

  useEffect(() => {
    sectionRefs.current = new Map();
    setActiveIndex(0);
  }, [tab, doc]);

  useEffect(() => {
    const container = stickyRef.current?.closest("main");
    if (!container) return undefined;
    const edge = stickyHeight + 30;
    const update = () => {
      const containerTop = container.getBoundingClientRect().top;
      let current = 0;
      sectionRefs.current.forEach((el, index) => {
        if (el.getBoundingClientRect().top - containerTop < edge) {
          current = Math.max(current, index);
        }
      });
      setActiveIndex(current);
    };
    update();
    container.addEventListener("scroll", update);
    return () => container.removeEventListener("scroll", update);
  }, [stickyHeight, tab, doc]);

  const jumpTo = (index: number, prefix: "sec" | "part") => {
    const anchorId = prefix === "sec" ? recapSectionAnchorId(index) : recapPartAnchorId(index);
    document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveIndex(index);
  };

  const origin = readOriginFromState(location.state);
  const stateOrigin = origin?.type === "book" ? origin : undefined;
  const crumbLabel = stateOrigin?.label ?? book?.title ?? "Книга";
  const crumbHref = stateOrigin?.url ?? `/book/${id}`;
  const crumb = { label: crumbLabel, href: crumbHref };

  if (bookLoading) {
    return (
      <>
        <PageHeader title="О чём книга" breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  if (!book) {
    return (
      <>
        <PageHeader title="Книга не найдена" breadcrumb={crumb} />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Книга не найдена</div>
      </>
    );
  }

  const padX = isMobile ? layout.mobileContentPaddingX : layout.desktopContentPaddingX;
  const tocEntries: TocEntry[] = doc
    ? (tab === "recap"
      ? doc.recap.sections.map((s, i) => ({ index: i, label: s.title }))
      : doc.retell.parts.map((p, i) => ({ index: i, label: `Часть ${p.number}` })))
    : [];

  return (
    <>
      <PageHeader title="О чём книга" breadcrumb={crumb} />

      <div
        style={{
          display: "flex",
          gap: isMobile ? 12 : 20,
          alignItems: "flex-start",
          marginBottom: isMobile ? 20 : 32,
          paddingBottom: isMobile ? 16 : 28,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <img
          src={`/api/covers/${book.id}?full=1`}
          alt={book.title}
          style={{
            width: isMobile ? 56 : 80,
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.12)",
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 20 : 26,
              fontWeight: 600,
              lineHeight: 1.2,
              marginBottom: 4,
            }}
          >
            О чём книга
          </h1>
          <div style={{ fontSize: isMobile ? 12 : 14, color: colors.textSecondary, marginBottom: 12 }}>
            по книге{" "}
            <Link to={`/book/${id}`} style={{ color: colors.text, textDecoration: "none", fontWeight: 500 }}>
              {book.title}
            </Link>
            {book.authors && book.authors.length > 0 && (
              <span> — {book.authors.map((a) => a.name).join(", ")}</span>
            )}
          </div>
          <div style={{ fontSize: isMobile ? 11 : 14, color: colors.textDim, lineHeight: 1.5 }}>
            Пересказ всей книги, включая финал
          </div>
        </div>
      </div>

      {!recapPath && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Рекап не найден</div>
      )}

      {recapPath && docLoading && (
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      )}

      {recapPath && !docLoading && docError && <LoadFailureNotice />}

      {recapPath && !docLoading && !docError && doc && (
        <>
          <div
            ref={stickyRef}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 5,
              margin: `0 -${padX}px`,
              padding: `0 ${padX}px`,
              backgroundColor: colors.bg,
              boxShadow: "0 8px 20px -14px rgba(0, 0, 0, 0.95)",
            }}
          >
            <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${colors.border}` }}>
              <button
                type="button"
                onClick={() => setTab("recap")}
                style={{
                  flex: isMobile ? 1 : undefined,
                  padding: isMobile ? "11px 4px" : "10px 18px",
                  textAlign: isMobile ? "center" : "left",
                  fontSize: isMobile ? 13 : 14,
                  fontFamily: "inherit",
                  background: "none",
                  border: "none",
                  borderBottom: `2px solid ${tab === "recap" ? colors.accent : "transparent"}`,
                  color: tab === "recap" ? colors.accent : colors.textDim,
                  cursor: "pointer",
                  marginBottom: -1,
                }}
              >
                Кратко
              </button>
              <button
                type="button"
                onClick={() => setTab("retell")}
                style={{
                  flex: isMobile ? 1 : undefined,
                  padding: isMobile ? "11px 4px" : "10px 18px",
                  textAlign: isMobile ? "center" : "left",
                  fontSize: isMobile ? 13 : 14,
                  fontFamily: "inherit",
                  background: "none",
                  border: "none",
                  borderBottom: `2px solid ${tab === "retell" ? colors.accent : "transparent"}`,
                  color: tab === "retell" ? colors.accent : colors.textDim,
                  cursor: "pointer",
                  marginBottom: -1,
                }}
              >
                Подробно
                {!isMobile && (
                  <span style={{ color: colors.textDim, fontSize: 12, marginLeft: 6 }}>
                    {doc.retell.parts.length} частей
                  </span>
                )}
              </button>
            </div>

            {isMobile && (
              <TableOfContents
                caption={tab === "recap" ? "Разделы" : "Части"}
                entries={tocEntries}
                activeIndex={activeIndex}
                isMobile
                onJump={(index) => jumpTo(index, tab === "recap" ? "sec" : "part")}
              />
            )}
          </div>

          <div style={{ display: "flex", gap: 36, alignItems: "flex-start", marginTop: 26 }}>
            {!isMobile && (
              <TableOfContents
                caption={tab === "recap" ? "Разделы" : "Части"}
                entries={tocEntries}
                activeIndex={activeIndex}
                isMobile={false}
                onJump={(index) => jumpTo(index, tab === "recap" ? "sec" : "part")}
              />
            )}
            <div style={{ flex: 1, maxWidth: 640, minWidth: 0 }}>
              {tab === "recap" ? (
                <RecapDocumentView
                  sections={doc.recap.sections}
                  isMobile={isMobile}
                  registerSectionRef={registerSectionRef}
                />
              ) : (
                <RecapRetellView
                  parts={doc.retell.parts}
                  isMobile={isMobile}
                  registerSectionRef={registerSectionRef}
                />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
