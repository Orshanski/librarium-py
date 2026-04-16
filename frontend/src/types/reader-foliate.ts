interface ReaderLocation {
  cfi?: string;
  fraction?: number;
}

export interface ReaderViewElement extends HTMLElement {
  book?: {
    toc?: unknown[];
    resolveHref: (href: string) => Promise<{ index: number; anchor: (doc: Document) => Element | null } | null> | { index: number; anchor: (doc: Document) => Element | null } | null;
    sections: Array<{ charCount?: number; createDocument?: () => Promise<Document> }>;
  };
  close: () => void;
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  goTo: (target: string | number) => Promise<void>;
  goToTextStart?: () => Promise<void>;
  lastLocation?: ReaderLocation;
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
