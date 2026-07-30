// frontend/src/cache/useCatalogList.ts
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { listBooks, type BookListParams } from "@/api/endpoints/books";
import type { Book } from "@/types";
import type { BookListContext } from "@/domain/read-models";
import type { MetadataCacheStore } from "./store";

export type CatalogListParams = {
  urlKey: string;
  sort: string;
  authorIds: ReadonlyArray<string>;
  seriesIds: ReadonlyArray<string>;
  tagIds: ReadonlyArray<string>;
  language: ReadonlyArray<string>;
  context: BookListContext;
};

export type CatalogListResult = {
  books: Book[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
};

type CatalogEntry = {
  books: Book[];
  hasMore: boolean;
  cursor: number;
};

const INITIAL_SIZE = 30;
const PAGE_SIZE = 15;

function mergeNextPage(prev: CatalogEntry, newBooks: Book[], hasMore: boolean): CatalogEntry {
  const ids = new Set(prev.books.map((b) => b.id));
  const merged = [...prev.books, ...newBooks.filter((b) => !ids.has(b.id))];
  return { books: merged, hasMore, cursor: merged.length };
}

function buildApiParams(
  params: CatalogListParams,
  cursor: number,
  pageSize: number,
): BookListParams & { pageSize: number; cursor: number } {
  return {
    sort: params.sort,
    pageSize,
    cursor,
    ...(params.authorIds.length ? { authorIds: [...params.authorIds] } : {}),
    ...(params.seriesIds.length ? { seriesIds: [...params.seriesIds] } : {}),
    ...(params.tagIds.length ? { tagIds: [...params.tagIds] } : {}),
    ...(params.language.length ? { language: [...params.language] } : {}),
  };
}

export function useCatalogList(
  store: MetadataCacheStore,
  params: CatalogListParams,
): CatalogListResult {
  const subscribe = useMemo(
    () => (handler: () => void) => store.subscribe("books", handler),
    [store],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => store.get<CatalogEntry>("books", params.urlKey),
    () => store.get<CatalogEntry>("books", params.urlKey),
  );
  const invalidationVersion = useSyncExternalStore(
    subscribe,
    () => store.invalidationVersion("books"),
    () => store.invalidationVersion("books"),
  );

  const [loading, setLoading] = useState<boolean>(entry === undefined);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Ключи наборов фильтров, для которых подгрузка сейчас в полёте. Раньше здесь был
  // один булев замок, и он не знал, чьим запросом занят: смена фильтров кэш не
  // инвалидирует, поэтому замок оставался занятым запросом ПРЕЖНЕГО набора и глушил
  // подгрузку нового вместе с разовой проверкой переполнения — короткий список нового
  // набора оставался недогруженным, а прокручивать его нечем (o6t1).
  //
  // Множество, а не один ключ: сценарий A → B → A при живом запросе A обязан
  // по-прежнему давать один запрос. Ref, а не state: обновляется синхронно, поэтому две
  // прокрутки подряд внутри одного набора не проходят обе.
  const loadingMoreKeysRef = useRef<Set<string>>(new Set());

  // Ключ набора, который сейчас на экране. Промис-цепочки loadMore читают его отсюда:
  // params в их замыкании заморожен на момент создания коллбэка и о смене фильтров
  // не знает, поэтому сравнение с params.urlKey внутри .then было бы сравнением
  // значения с самим собой.
  const currentKeyRef = useRef(params.urlKey);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Deps: urlKey covers all URL-derived fields (sort + ids + languages). `invalidationVersion`
  // covers every path that removes/clears the entry (invalidate, bookCreated, structural patches —
  // they all bump it) AND the cold-mount race where entry stays undefined across an invalidate.
  // Task 7's regression pin verifies refetch-on-invalidation; Task 3's race test verifies cold-mount.
  useEffect(() => {
    // Nav to an already-cached key: flip loading false in case we arrived from a loading=true state.
    if (entry !== undefined) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const startedAtInvalidationVersion = store.invalidationVersion("books");
    setLoading(true);
    listBooks(buildApiParams(params, 0, INITIAL_SIZE), controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (store.invalidationVersion("books") !== startedAtInvalidationVersion) return;
        const books = data.books ?? [];
        const next: CatalogEntry = {
          books,
          hasMore: data.hasMore ?? false,
          cursor: books.length,
        };
        store.set("books", params.urlKey, next, { context: params.context });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load catalog:", err);
        setLoading(false);
      });
    return () => controller.abort();
  }, [store, params.urlKey, params.context, invalidationVersion]);

  // Сброс кэша книг снимает все замки разом: записей, в которые можно дописать
  // страницу, больше нет, а пришедшие ответы отсекаются проверкой версии.
  //
  // Инвариант: ветки раннего выхода в .then/.catch (несовпадение версии) замок НЕ
  // трогают. Иначе устаревший ответ, пришедший после инвалидации и после того, как
  // преемник уже поставил свой замок, снял бы чужой — и по тому же курсору ушёл бы
  // второй запрос. Закреплено тестом про отказ подгрузки после инвалидации.
  useEffect(() => {
    loadingMoreKeysRef.current.clear();
    setLoadingMore(false);
  }, [invalidationVersion]);

  // Смена набора фильтров: запоминаем, что сейчас на экране, и показываем индикатор
  // только если у ЭТОГО набора есть свой запрос в полёте. Раньше индикатор доставался
  // новому набору по наследству — горел без запроса и гас по чужому ответу.
  useEffect(() => {
    currentKeyRef.current = params.urlKey;
    setLoadingMore(loadingMoreKeysRef.current.has(params.urlKey));
  }, [params.urlKey]);

  // loadMore intentionally re-reads `baseline` from the store inside `.then(...)` rather than
  // closing over the snapshot captured at click time. This preserves domain patches
  // (applyBookUpdate / etc.) that may land during the round-trip — they'd otherwise be
  // overwritten by a stale `current` snapshot. `params.sort`/`authorIds`/etc. are intentionally
  // omitted from deps: `params.urlKey` already encodes them.
  //
  // `loading` is in deps so that when the initial fetch resolves (loading flips true→false),
  // loadMore's identity changes — the scroll-effect rebinds and re-arms the 300ms overflow
  // check against the freshly populated entry. Without this, a slow initial fetch + tall
  // viewport leaves the user stuck (one-shot 300ms timer fired against an undefined entry).
  const loadMore = useCallback(() => {
    const requestKey = params.urlKey;
    const current = store.get<CatalogEntry>("books", requestKey);
    if (!current || !current.hasMore || loadingMoreKeysRef.current.has(requestKey)) return;
    const startedAtInvalidationVersion = store.invalidationVersion("books");
    loadingMoreKeysRef.current.add(requestKey);
    setLoadingMore(true);
    listBooks(buildApiParams(params, current.cursor, PAGE_SIZE))
      .then((data) => {
        if (store.invalidationVersion("books") !== startedAtInvalidationVersion) return;
        // Defensive: в нынешней модели стора любой путь удаления записи заодно поднимает
        // invalidationVersion, поэтому ветка недостижима. Оставлена на случай появления
        // неинвалидирующего удаления (например точечного store.delete) — иначе получили бы
        // NaN cursor. Замок снимаем ДО выхода: иначе ключ остался бы в множестве навсегда
        // и подгрузка этого набора у этого экземпляра хука умерла бы до размонтирования.
        // Если такой путь удаления появится — добавить тест, проходящий через эту ветку.
        const baseline = store.get<CatalogEntry>("books", requestKey);
        if (!baseline) {
          loadingMoreKeysRef.current.delete(requestKey);
          if (mountedRef.current && currentKeyRef.current === requestKey) setLoadingMore(false);
          return;
        }
        const next = mergeNextPage(baseline, data.books ?? [], data.hasMore ?? false);
        store.set("books", requestKey, next, { context: params.context });
        loadingMoreKeysRef.current.delete(requestKey);
        // Индикатор гасим, только если на экране всё ещё наш набор.
        if (mountedRef.current && currentKeyRef.current === requestKey) setLoadingMore(false);
      })
      .catch((err: unknown) => {
        if (store.invalidationVersion("books") !== startedAtInvalidationVersion) return;
        // Замок снимаем раньше проверки монтирования: он относится к запросу, а не к
        // жизни компонента.
        loadingMoreKeysRef.current.delete(requestKey);
        if (!mountedRef.current) return;
        console.warn("Failed to load more books:", err);
        if (currentKeyRef.current === requestKey) setLoadingMore(false);
      });
  }, [store, params.urlKey, params.context, loading]);

  useEffect(() => {
    // Note: <main> is shared with useScrollRestore in the page. Restoring scroll position can
    // dispatch a scroll event that fires onScroll here and triggers loadMore — intended.
    const main = document.querySelector("main");
    if (!main) return undefined;

    function onScroll() {
      if (main!.scrollTop + main!.clientHeight >= main!.scrollHeight - 300) {
        loadMore();
      }
    }
    function check() {
      if (main!.scrollHeight <= main!.clientHeight) {
        loadMore();
      }
    }

    main.addEventListener("scroll", onScroll, { passive: true });
    const timer = setTimeout(check, 300);
    return () => {
      main.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [loadMore]);

  return {
    books: entry?.books ?? [],
    loading,
    loadingMore,
    hasMore: entry?.hasMore ?? false,
    loadMore,
  };
}
