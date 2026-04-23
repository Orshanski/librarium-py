import { useEffect } from "react";

declare global {
  // eslint-disable-next-line no-var
  var __librariumReaderActiveCount: number | undefined;
}

/** Tracks how many reader instances are active on the page. */
export function useReaderSessionFlag() {
  useEffect(() => {
    globalThis.__librariumReaderActiveCount = (globalThis.__librariumReaderActiveCount ?? 0) + 1;
    return () => {
      const next = (globalThis.__librariumReaderActiveCount ?? 1) - 1;
      globalThis.__librariumReaderActiveCount = Math.max(0, next);
    };
  }, []);
}
