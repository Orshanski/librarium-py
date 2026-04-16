import type { ReaderSettings } from "../types/reader-settings";
import { THEME_STYLES } from "../constants/reader-theme";

/** Apply user reading settings (theme, font, spacing) to a book iframe document. */
export function applySettings(doc: Document, settings: ReaderSettings, renderer?: { setStyles?: (s: string) => void }) {
  const theme = THEME_STYLES[settings.theme];
  const s = doc.documentElement.style;
  s.setProperty("--user-bg", theme.bg);
  s.setProperty("--user-color", theme.text);
  s.setProperty("--user-accent", theme.accent);
  s.setProperty("--user-font", settings.fontFamily);
  s.setProperty("--user-font-size", `${settings.fontSize}px`);
  s.setProperty("--user-line-height", String(settings.lineSpacing));
  s.setProperty("--user-text-align", settings.justify ? "justify" : "start");
  s.setProperty("--user-hyphens", settings.hyphenate ? "auto" : "manual");
  // Trigger paginator background update
  renderer?.setStyles?.("");
}
