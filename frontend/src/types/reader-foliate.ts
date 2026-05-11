export interface ReaderViewElement extends HTMLElement {
  book?: {
    toc?: unknown[];
    resolveHref: (href: string) => Promise<{ index: number; anchor: (doc: Document) => Element | null } | null> | { index: number; anchor: (doc: Document) => Element | null } | null;
    sections: Array<{
      charCount?: number;
      counted?: boolean;
      createDocument?: () => Document | Promise<Document>;
      isCover?: boolean;
      isOpening?: boolean;
      size?: number;
    }>;
  };
  close: () => void;
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  goTo: (target: string | number) => Promise<void>;
  goToTextStart?: () => Promise<void>;
  lastLocation?: { cfi?: string; fraction?: number; isCover?: boolean; isOpening?: boolean };
  next: () => Promise<void>;
  open: (book: Blob) => Promise<void>;
  prev: () => Promise<void>;
  renderer?: {
    destroy?: () => void;
    feet?: HTMLElement[];
    getContents?: () => Array<{ doc: Document }>;
    setAttribute: (name: string, value: string) => void;
    setStyles?: (styles: string) => void;
  };
}
