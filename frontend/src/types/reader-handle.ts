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

/**
 * `onReady` fires once content is loaded and the initial navigation has completed.
 * `onRelocate` is UI-only and follows foliate location changes.
 * `onSavePosition` is persistence-only and runs after explicit navigation/pagehide.
 */
export interface ReaderCallbacks {
  onRelocate?: (detail: ReaderRelocateDetail) => void;
  onReady?: () => void;
  onSavePosition?: (cfi: string, fraction: number) => void;
}
