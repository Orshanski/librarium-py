import type { ReaderSettings, TapAction } from "./reader-settings";
import type { TocItem } from "./reader-toc";

export interface ReaderToolbarProps {
  bookTitle: string;
  fraction: number;
  tocItems: TocItem[];
  currentTocHref: string;
  settings: ReaderSettings;
  onSettingsChange: (s: ReaderSettings) => void;
  onTocSelect: (href: string) => void;
  onClose: () => void;
  maxTocDepth?: number;
  hideStyles?: boolean;
  tapZonesKey?: "desktopTapZones" | "pdfTapZones";
  availableActions?: TapAction[];
}
