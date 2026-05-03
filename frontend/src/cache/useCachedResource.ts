import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { BookListContext } from "@/domain/read-models";
import type { MetadataCacheStore } from "./store";

export type CachedResourceResult<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
};

export type CachedResourceOptions = {
  context?: BookListContext;
};

export function useCachedResource<T>(
  store: MetadataCacheStore,
  namespace: string,
  cacheKey: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: CachedResourceOptions = {},
): CachedResourceResult<T> {
  const resourceId = `${namespace}\u0000${cacheKey}`;
  const fetcherRef = useRef(fetcher);
  const contextRef = useRef(options.context);

  useEffect(() => {
    fetcherRef.current = fetcher;
    contextRef.current = options.context;
  });

  const subscribe = useMemo(
    () => (handler: () => void) => store.subscribe(namespace, handler),
    [store, namespace],
  );
  const data = useSyncExternalStore(
    subscribe,
    () => store.get<T>(namespace, cacheKey),
    () => store.get<T>(namespace, cacheKey),
  );
  const [errorState, setErrorState] = useState<{ resourceId: string; error: Error } | undefined>(undefined);

  useEffect(() => {
    if (data !== undefined) return undefined;
    const controller = new AbortController();
    setErrorState(undefined);
    fetcherRef.current(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          store.set(namespace, cacheKey, value, { context: contextRef.current });
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof Error && caught.name === "AbortError") return;
        setErrorState({
          resourceId,
          error: caught instanceof Error ? caught : new Error(String(caught)),
        });
      });
    return () => controller.abort();
  }, [store, namespace, cacheKey, resourceId, data]);

  const error = errorState?.resourceId === resourceId ? errorState.error : undefined;
  return { data, loading: data === undefined && !error, error: data === undefined ? error : undefined };
}
