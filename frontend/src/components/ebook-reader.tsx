import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import FootnotePopup from "./FootnotePopup";
import { useFootnoteState } from "../hooks/useFootnoteState";
import { useEbookReaderInstance } from "../hooks/useEbookReaderInstance";
import type { ReaderSettings } from "../types/reader-settings";
import { THEME_STYLES } from "../constants/reader-theme";
import { applySettings } from "../utils/reader-styling";
import { useReaderFooter } from "../hooks/useReaderFooter";
import type { EbookReaderHandle, ReaderCallbacks, ReaderNavigationRequest } from "../types/reader-handle";
import type { ReaderViewElement } from "../types/reader-foliate";

export type { ReaderCallbacks };

interface EbookReaderProps {
  bookBlob: Blob;
  initialPosition?: string | null;
  settings: ReaderSettings;
  onCenterTap?: () => void;
  callbacks?: ReaderCallbacks;
  maxInlineSize?: string;
  gap?: string;
  showFooter?: boolean;
  margin?: string;
  maxBlockSize?: string;
  isMobile?: boolean;
}


const EbookReader = forwardRef<EbookReaderHandle, EbookReaderProps>(function EbookReader(
  { bookBlob, initialPosition, settings, onCenterTap, callbacks, maxInlineSize = "1000px", gap = "5%", margin, maxBlockSize, showFooter = true, isMobile = false }: EbookReaderProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ReaderViewElement | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const onCenterTapRef = useRef(onCenterTap);
  onCenterTapRef.current = onCenterTap;
  const settingsRef = useRef(settings);
  const configRef = useRef({ maxInlineSize, gap, margin, maxBlockSize, showFooter, isMobile });
  const performNavigationRef = useRef<(request: ReaderNavigationRequest) => Promise<void>>(async () => {});
  const footnote = useFootnoteState();
  const footer = useReaderFooter(containerRef, settingsRef, configRef);

  // Apply settings when they change
  useEffect(() => {
    settingsRef.current = settings;
    configRef.current = { maxInlineSize, gap, margin, maxBlockSize, showFooter, isMobile };
    const view = viewRef.current;
    if (!view?.renderer) return;
    // Apply CSS variables to current document
    const contents = view.renderer.getContents?.();
    if (contents?.length) {
      for (const { doc } of contents) {
        if (doc) applySettings(doc, settings, view.renderer);
      }
    }
    // Layout attributes
    view.renderer.setAttribute("flow", settings.flow);
    view.renderer.setAttribute("max-inline-size", configRef.current.maxInlineSize);
    view.renderer.setAttribute("gap", configRef.current.gap);
    if (configRef.current.margin) view.renderer.setAttribute("margin", configRef.current.margin);
    if (configRef.current.maxBlockSize) view.renderer.setAttribute("max-block-size", configRef.current.maxBlockSize);
    footer.recalcPages();
  }, [settings, gap, isMobile, margin, maxBlockSize, maxInlineSize, showFooter]);

  // Empty deps: all methods access via stable refs, no need to recreate handle.
  useImperativeHandle(ref, () => ({
    getToc: () => viewRef.current?.book?.toc ?? [],
    hasRenderer: () => Boolean(viewRef.current?.renderer),
    performNavigation: (request: ReaderNavigationRequest) => performNavigationRef.current(request),
  }), []);

  useEbookReaderInstance({
    bookBlob,
    initialPosition,
    containerRef,
    viewRef,
    performNavigationRef,
    callbacksRef,
    onCenterTapRef,
    settingsRef,
    configRef,
    footnote,
    footer,
  });

  const theme = THEME_STYLES[settings.theme];

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: theme.bg,
        }}
      />
      <FootnotePopup html={footnote.html} side={footnote.side} settings={settings} />
    </>
  );
});

export default EbookReader;
