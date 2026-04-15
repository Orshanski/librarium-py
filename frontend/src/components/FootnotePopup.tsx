import type { CSSProperties } from "react";
import { THEME_STYLES, ReaderSettings } from "./reader-toolbar";

interface FootnotePopupProps {
  html: string | null;
  side: "left" | "right";
  settings: ReaderSettings;
}

export default function FootnotePopup({ html, side, settings }: FootnotePopupProps) {
  if (!html) return null;

  const theme = THEME_STYLES[settings.theme];

  const popupStyle: CSSProperties = {
    "--footnote-accent": theme.accent,
    position: "fixed",
    bottom: 16,
    ...(window.innerWidth > 1000
      ? (side === "left" ? { left: "5%", right: "55%" } : { left: "55%", right: "5%" })
      : { left: "5%", right: "5%" }),
    maxHeight: "40vh",
    overflowY: "auto",
    backgroundColor: theme.bg,
    color: theme.text,
    border: `1px solid ${theme.accent}`,
    borderRadius: 12,
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
    padding: "16px 20px",
    fontSize: Math.round(settings.fontSize * 0.9),
    lineHeight: 1.4,
    fontFamily: settings.fontFamily,
    zIndex: 100,
  } as CSSProperties;

  return (
    <>
      <style>{`.footnote-popup>h1,.footnote-popup>h2,.footnote-popup>h3{font-size:1em;margin:0 0 8px 0;color:var(--footnote-accent)}.footnote-popup>p{margin:4px 0}`}</style>
      <div
        className="footnote-popup"
        style={popupStyle}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
