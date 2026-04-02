import { useIsMobile } from "../responsive";
import DesktopReaderToolbar from "./desktop/desktop-reader-toolbar";
import MobileReaderToolbar from "./mobile/mobile-reader-toolbar";

export type ReaderTheme = "dark" | "warm" | "light";

export interface ReaderSettings {
  fontSize: number;
  lineSpacing: number;
  fontFamily: string;
  flow: "paginated" | "scrolled";
  theme: ReaderTheme;
  hyphenate: boolean;
  justify: boolean;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 16,
  lineSpacing: 1.5,
  fontFamily: "Georgia, serif",
  flow: "paginated",
  theme: "light",
  hyphenate: true,
  justify: true,
};

export const FONT_OPTIONS = [
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Palatino", value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { label: "Book Antiqua", value: "'Book Antiqua', Palatino, 'Palatino Linotype', serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica Neue", value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

export const THEME_STYLES: Record<ReaderTheme, { bg: string; text: string; accent: string }> = {
  dark: { bg: "#1a1a2e", text: "#e8e6e0", accent: "#f9be03" },
  warm: { bg: "#e8dcc8", text: "#3a2e1e", accent: "#8b6914" },
  light: { bg: "#f4f0e8", text: "#2a2218", accent: "#8b6914" },
};

export interface ReaderToolbarProps {
  bookTitle: string;
  fraction: number;
  tocItems: any[];
  settings: ReaderSettings;
  onSettingsChange: (s: ReaderSettings) => void;
  onTocSelect: (href: string) => void;
  onClose: () => void;
}

export function flattenToc(items: any[], depth = 0): any[] {
  const result: any[] = [];
  for (const item of items) {
    result.push({ ...item, depth });
    if (item.subitems) result.push(...flattenToc(item.subitems, depth + 1));
  }
  return result;
}

export default function ReaderToolbar(props: ReaderToolbarProps) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileReaderToolbar {...props} /> : <DesktopReaderToolbar {...props} />;
}
