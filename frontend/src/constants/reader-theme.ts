import type { ReaderTheme } from "../types/reader-settings";

export const THEME_STYLES: Record<ReaderTheme, { bg: string; text: string; accent: string }> = {
  dark: { bg: "#1a1a2e", text: "#e8e6e0", accent: "#f9be03" },
  warm: { bg: "#e8dcc8", text: "#3a2e1e", accent: "#8b6914" },
  light: { bg: "#f4f0e8", text: "#2a2218", accent: "#8b6914" },
};
