import { useRef, useState, type MutableRefObject } from "react";

export interface FootnoteState {
  html: string | null;
  side: "left" | "right";
  isOpenRef: MutableRefObject<boolean>;
  clickXRef: MutableRefObject<number>;
  clickYRef: MutableRefObject<number>;
  handlerCallbacks: {
    setFootnoteHtml: (html: string | null) => void;
    setFootnoteSide: (side: "left" | "right") => void;
    setFootnoteOpen: (open: boolean) => void;
    lastClickXRef: MutableRefObject<number>;
  };
  dismiss: () => void;
}

export function useFootnoteState(): FootnoteState {
  const [html, setHtml] = useState<string | null>(null);
  const [side, setSide] = useState<"left" | "right">("left");
  const isOpenRef = useRef(false);
  const clickXRef = useRef(0);
  const clickYRef = useRef(0);

  return {
    html,
    side,
    isOpenRef,
    clickXRef,
    clickYRef,
    handlerCallbacks: {
      setFootnoteHtml: setHtml,
      setFootnoteSide: setSide,
      setFootnoteOpen: (open) => {
        isOpenRef.current = open;
      },
      lastClickXRef: clickXRef,
    },
    dismiss: () => {
      setHtml(null);
      isOpenRef.current = false;
    },
  };
}
