import { useRef, useCallback } from "react";
import type { ReaderSettings } from "../types/reader-settings";
import { THEME_STYLES } from "../constants/reader-theme";
import { estimateCharsPerPage } from "../utils/reader-input";

interface FooterConfig {
  showFooter: boolean;
}

/**
 * Manages virtual page counting (from character estimates) and footer rendering
 * into foliate's `renderer.feet` elements.
 *
 * Returns:
 * - `recalcPages`: call after settings/layout change
 * - `updateFooter`: call from relocate listener with current fraction/tocItem
 * - `startCharCount`: call after book open with sections array
 * - `cleanupCharCount`: call on dispose
 */
export function useReaderFooter(
  containerRef: React.RefObject<HTMLDivElement | null>,
  settingsRef: React.RefObject<ReaderSettings>,
  configRef: React.RefObject<FooterConfig>,
) {
  const totalCharsRef = useRef(0);
  const totalPagesRef = useRef(0);
  const charCountTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const recalcPages = useCallback(() => {
    const container = containerRef.current;
    if (!container || !totalCharsRef.current) return;
    const cpp = estimateCharsPerPage(container, settingsRef.current);
    totalPagesRef.current = Math.max(1, Math.round(totalCharsRef.current / cpp));
  }, [containerRef, settingsRef]);

  const updateFooter = useCallback((
    fraction: number,
    tocItem: { label: string } | undefined,
    feet: HTMLElement[] | undefined,
  ) => {
    if (!configRef.current.showFooter || !feet?.length || totalPagesRef.current <= 0) return;
    const theme = THEME_STYLES[settingsRef.current.theme];
    const currentPage = Math.min(Math.max(1, Math.round(fraction * totalPagesRef.current)), totalPagesRef.current);
    const pageText = `${currentPage} / ${totalPagesRef.current}`;
    const chapterText = tocItem?.label || "";
    const footStyle = {
      fontSize: "12px",
      color: theme.text,
      fontFamily: "'IBM Plex Sans', sans-serif",
      opacity: "0.7",
      textOverflow: "ellipsis",
      overflow: "hidden",
      whiteSpace: "nowrap",
    };
    if (feet.length === 1) {
      Object.assign(feet[0].style, { ...footStyle, textAlign: "center" });
      feet[0].textContent = chapterText ? `${pageText}  ·  ${chapterText}` : pageText;
    } else {
      Object.assign(feet[0].style, { ...footStyle, textAlign: "left" });
      feet[0].textContent = pageText;
      Object.assign(feet[feet.length - 1].style, { ...footStyle, textAlign: "right" });
      feet[feet.length - 1].textContent = chapterText;
    }
  }, [configRef, settingsRef]);

  const startCharCount = useCallback((
    sections: Array<{ charCount?: number; createDocument?: () => Promise<Document> }>,
    disposed: { current: boolean },
  ) => {
    const hasCharCount = sections.some(s => s.charCount != null);
    if (hasCharCount) {
      totalCharsRef.current = sections.reduce((sum, s) => sum + (s.charCount || 0), 0);
      recalcPages();
      return;
    }
    // EPUB: count incrementally after first paint
    charCountTimerRef.current = setTimeout(async () => {
      try {
        let totalChars = 0;
        const batch = 3;
        for (let i = 0; i < sections.length; i += batch) {
          if (disposed.current) return;
          for (let j = i; j < Math.min(i + batch, sections.length); j++) {
            const s = sections[j];
            if (!s.createDocument) continue;
            const doc = await s.createDocument();
            totalChars += (doc.body?.textContent?.length || 0);
          }
          totalCharsRef.current = totalChars;
          recalcPages();
          await new Promise(r => setTimeout(r, 0));
        }
      } catch (err) {
        console.warn("Failed to count chars:", err);
      }
    }, 100);
  }, [recalcPages]);

  const cleanupCharCount = useCallback(() => {
    clearTimeout(charCountTimerRef.current);
  }, []);

  return { recalcPages, updateFooter, startCharCount, cleanupCharCount };
}
