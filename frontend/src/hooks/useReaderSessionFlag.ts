import { useEffect } from "react";

const readerWindow = window as Window & { __librariumReaderActiveCount?: number };

/** Tracks how many reader instances are active on the page. */
export function useReaderSessionFlag() {
  useEffect(() => {
    readerWindow.__librariumReaderActiveCount = (readerWindow.__librariumReaderActiveCount ?? 0) + 1;
    return () => {
      const next = (readerWindow.__librariumReaderActiveCount ?? 1) - 1;
      readerWindow.__librariumReaderActiveCount = Math.max(0, next);
    };
  }, []);
}
