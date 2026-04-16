export interface ReaderRelocateDetail {
  fraction: number;
  cfi: string;
  tocItem?: { label: string; href: string };
  location?: { current: number; total: number };
}

export type ReaderNavigationRequest =
  | { type: "prev" | "next"; persist?: boolean; allowDuringInit?: boolean }
  | { type: "goTo"; target: string | number; persist?: boolean; allowDuringInit?: boolean };

export interface EbookReaderHandle {
  getToc: () => unknown[];
  hasRenderer: () => boolean;
  performNavigation: (request: ReaderNavigationRequest) => Promise<void>;
}
