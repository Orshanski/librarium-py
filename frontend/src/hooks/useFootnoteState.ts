import { useRef, useState, type RefObject } from "react";
import type { FootnoteHandlerCallbacks } from "../utils/reader-footnote-handler";

export interface FootnoteState {
  html: string | null;
  side: "left" | "right";
  // RefObject (React 19+ allows mutation through it; MutableRefObject is deprecated).
  // Listeners outside React's reconciliation mutate `.current`.
  isOpenRef: RefObject<boolean>;
  lastClickXRef: RefObject<number>;
  lastClickYRef: RefObject<number>;
  // Same object as lastClickXRef inside; wrapped here to satisfy
  // FootnoteHandlerCallbacks shape without giving callers two ways to reach
  // the same ref.
  handlerCallbacks: FootnoteHandlerCallbacks;
  dismiss: () => void;
}

export function useFootnoteState(): FootnoteState {
  const [html, setHtml] = useState<string | null>(null);
  const [side, setSide] = useState<"left" | "right">("left");
  const isOpenRef = useRef(false);
  const lastClickXRef = useRef(0);
  const lastClickYRef = useRef(0);

  // dismiss and handlerCallbacks are fresh per render. Their consumers in
  // ebook-reader live inside a [bookBlob]-scoped useEffect that captures
  // them once at mount; the closures only reference stable useState setters
  // and stable refs, so no stale-state risk. Wrapping in useCallback/useMemo
  // would add noise without changing behavior.
  return {
    html,
    side,
    isOpenRef,
    lastClickXRef,
    lastClickYRef,
    handlerCallbacks: {
      setFootnoteHtml: setHtml,
      setFootnoteSide: setSide,
      // Ref-write, not React state. reader-interaction reads via lazy
      // () => isOpenRef.current; converting to useState would deliver a
      // stale boolean to that read.
      setFootnoteOpen: (open) => {
        isOpenRef.current = open;
      },
      lastClickXRef,
    },
    dismiss: () => {
      setHtml(null);
      isOpenRef.current = false;
    },
  };
}
