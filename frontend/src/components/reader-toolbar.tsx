import { useIsMobile } from "../responsive";
import DesktopReaderToolbar from "./desktop/desktop-reader-toolbar";
import MobileReaderToolbar from "./mobile/mobile-reader-toolbar";

export type ReaderTheme = "dark" | "warm" | "light";

export type TapAction = "prev" | "next" | "zoom_in" | "zoom_out";

export interface DesktopTapZones {
  topLeft: TapAction;
  bottomLeft: TapAction;
  topCenter: TapAction;
  bottomCenter: TapAction;
  topRight: TapAction;
  bottomRight: TapAction;
}

export const DEFAULT_DESKTOP_TAP_ZONES: DesktopTapZones = {
  topLeft: "prev",
  bottomLeft: "prev",
  topCenter: "next",
  bottomCenter: "prev",
  topRight: "next",
  bottomRight: "next",
};

export const DEFAULT_PDF_TAP_ZONES: DesktopTapZones = {
  topLeft: "prev",
  bottomLeft: "prev",
  topCenter: "zoom_in",
  bottomCenter: "zoom_out",
  topRight: "next",
  bottomRight: "next",
};

export interface ReaderSettings {
  fontSize: number;
  lineSpacing: number;
  fontFamily: string;
  flow: "paginated" | "scrolled";
  theme: ReaderTheme;
  hyphenate: boolean;
  justify: boolean;
  desktopTapZones: DesktopTapZones;
  pdfTapZones: DesktopTapZones;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 16,
  lineSpacing: 1.5,
  fontFamily: "Georgia, serif",
  flow: "paginated",
  theme: "light",
  hyphenate: true,
  justify: true,
  desktopTapZones: DEFAULT_DESKTOP_TAP_ZONES,
  pdfTapZones: DEFAULT_PDF_TAP_ZONES,
};

export const FONT_OPTIONS = [
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Palatino", value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica Neue", value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

export const THEME_STYLES: Record<ReaderTheme, { bg: string; text: string; accent: string }> = {
  dark: { bg: "#1a1a2e", text: "#e8e6e0", accent: "#f9be03" },
  warm: { bg: "#e8dcc8", text: "#3a2e1e", accent: "#8b6914" },
  light: { bg: "#f4f0e8", text: "#2a2218", accent: "#8b6914" },
};

export interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

export interface FlatTocItem {
  label: string;
  href: string;
  depth: number;
}

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

export function flattenToc(items: TocItem[], depth = 0, maxDepth = Infinity): FlatTocItem[] {
  const result: FlatTocItem[] = [];
  if (depth > maxDepth) return result;
  for (const item of items) {
    result.push({ label: item.label, href: item.href, depth });
    if (item.subitems && depth + 1 <= maxDepth) {
      result.push(...flattenToc(item.subitems, depth + 1, maxDepth));
    }
  }
  return result;
}

export default function ReaderToolbar(props: ReaderToolbarProps) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileReaderToolbar {...props} /> : <DesktopReaderToolbar {...props} />;
}
