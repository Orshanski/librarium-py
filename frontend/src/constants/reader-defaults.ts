import type { DesktopTapZones, ReaderSettings } from "../types/reader-settings";

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
