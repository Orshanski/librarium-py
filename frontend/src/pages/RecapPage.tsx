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

/** Якорь раздела вкладки: по нему идут и переход по оглавлению, и пересчёт подсветки. */
function anchorIdFor(tab: Tab, index: number): string {
  return tab === "recap" ? recapSectionAnchorId(index) : recapPartAnchorId(index);
}

function TableOfContents({
  caption,
  entries,
  activeIndex,
  isMobile,
  stickyTop,
  onJump,
}: Readonly<{
  caption: string;
  entries: TocEntry[];
  activeIndex: number;
  isMobile: boolean;
  /** Отступ сверху для закрепления: высота шапки страницы плюс полосы вкладок. */
  stickyTop?: number;
  onJump: (index: number) => void;
}>) {
  // На телефоне пункты идут лентой в один ряд, и подсвеченный уезжает за край
  // экрана вслед за прокруткой текста. Подтягиваем его обратно на глаза —
  // иначе подсветка есть, а видно её не всегда. Двигаем саму ленту, а не зовём
  // scrollIntoView: тот приводит элемент в вид у каждого прокручиваемого
  // предка, то есть трогал бы и страницу целиком. На десктопе колонка стоит
  // целиком, и ссылки ниже ни к чему не привязаны.
  const stripRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const item = activeRef.current;
    if (!strip || !item) return;
    // Активный пункт встаёт в середину ленты. Положение считается от него
    // самого, а не от текущей прокрутки: повторный пересчёт тогда ничего не
    // сдвигает, и лента не зависит от того, сколько раз он случился. Правый
    // край браузер ограничит сам.
    //
    // Отсчёт — от левого края содержимого ленты, в той же системе, что и её
    // scrollLeft: лента объявлена позиционированной (`position: relative`
    // ниже) и потому сама служит началом отсчёта для своих пунктов. Без этого
    // отсчёт шёл бы от закреплённой обёртки и тянул бы за собой её боковой
    // отступ.
    const centered = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2;
    strip.scrollLeft = Math.max(0, centered);
  }, [activeIndex]);

  if (isMobile) {
    return (
      <nav
        aria-label={caption}
        ref={stripRef}
        style={{
          // Лента — начало отсчёта для своих пунктов (см. подтягивание выше).
          position: "relative",
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
            ref={activeIndex === entry.index ? activeRef : null}
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
    <nav
      aria-label={caption}
      style={{
        width: 196,
        flexShrink: 0,
        // Оглавление не уезжает с текстом: липнет под закреплённой полосой вкладок.
        position: "sticky",
        top: stickyTop ?? 0,
        alignSelf: "flex-start",
      }}
    >
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
      // Документа нет — подсветке не за что держаться (см. пару ниже).
      setActiveIndex(0);
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
        // Другая книга — другой документ, и прежний пункт к нему отношения не
        // имеет. Сброс висит на самой смене документа по той же причине, что и
        // на смене вкладки ниже.
        setActiveIndex(0);
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
  // Массива зависимостей нет намеренно: в отличие от шапки страницы, эта
  // закреплённая обёртка появляется только после загрузки документа, поэтому
  // эффект обязан идти на каждую отрисовку — иначе он пропустит момент, когда
  // ссылка на неё наконец появится.
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return undefined;
    const update = () => setStickyHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  });

  // Пока идёт плавная прокрутка к выбранному разделу, пересчёт по прокрутке
  // молчит: иначе он сразу же перебивает выбор человека тем разделом, который
  // виден в этот момент, и подсветка возвращается на прежнее место.
  const jumpUntilRef = useRef(0);

  // Новая вкладка начинается с первого пункта: выбор раздела включает секунду
  // тишины, и переключение внутри неё оставило бы подсветку на пункте прошлой
  // вкладки — где его может и не быть. Сброс висит на самой смене вкладки, как
  // в нативе (RecapModel, didSet у tab): отдельным эффектом он работал бы,
  // только пока объявлен выше пересчёта, а эта связь ничем не держится.
  const switchTab = (next: Tab) => {
    setTab(next);
    setActiveIndex(0);
  };

  // Подсветка текущего раздела при прокрутке: сравниваем верх каждого раздела
  // с нижней кромкой закреплённой полосы внутри скролл-контейнера страницы.
  // Разделы берём из документа по их якорям в момент пересчёта и нигде не
  // храним: хранимый список успевал устареть — переключение вкладки оставляло
  // его пустым, и подсветка навсегда замирала на первом пункте.
  useEffect(() => {
    const container = stickyRef.current?.closest("main");
    if (!container) return undefined;
    const edge = stickyHeight + 30;
    const count = doc ? (tab === "recap" ? doc.recap.sections.length : doc.retell.parts.length) : 0;
    // Обход только читает геометрию — записей между чтениями нет, поэтому
    // браузер верстает один раз на весь проход и копить пересчёты по кадрам не
    // требуется. Появится здесь запись в раскладку — это перестанет быть верно.
    const update = () => {
      if (performance.now() < jumpUntilRef.current) return;
      const containerTop = container.getBoundingClientRect().top;
      let current = 0;
      for (let index = 0; index < count; index++) {
        const el = document.getElementById(anchorIdFor(tab, index));
        // Разделы идут по порядку сверху вниз, поэтому подходящий последний и
        // есть текущий.
        if (el && el.getBoundingClientRect().top - containerTop < edge) current = index;
      }
      setActiveIndex(current);
    };
    update();
    container.addEventListener("scroll", update);
    return () => container.removeEventListener("scroll", update);
  }, [stickyHeight, tab, doc]);

  const jumpTo = (index: number) => {
    jumpUntilRef.current = performance.now() + 1000;
    setActiveIndex(index);
    document.getElementById(anchorIdFor(tab, index))?.scrollIntoView({ behavior: "smooth", block: "start" });
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
                onClick={() => switchTab("recap")}
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
                onClick={() => switchTab("retell")}
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
                // Другая вкладка — другое оглавление: лента заводится заново и
                // не остаётся отмотанной там, где её оставили на прошлой.
                key={tab}
                caption={tab === "recap" ? "Разделы" : "Части"}
                entries={tocEntries}
                activeIndex={activeIndex}
                isMobile
                onJump={jumpTo}
              />
            )}
          </div>

          <div style={{ display: "flex", gap: 36, alignItems: "flex-start", marginTop: 26 }}>
            {!isMobile && (
              <TableOfContents
                key={tab}
                caption={tab === "recap" ? "Разделы" : "Части"}
                entries={tocEntries}
                activeIndex={activeIndex}
                isMobile={false}
                stickyTop={stickyHeight + 14}
                onJump={jumpTo}
              />
            )}
            <div style={{ flex: 1, maxWidth: 640, minWidth: 0 }}>
              {tab === "recap" ? (
                <RecapDocumentView sections={doc.recap.sections} isMobile={isMobile} />
              ) : (
                <RecapRetellView parts={doc.retell.parts} isMobile={isMobile} />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
