import { useState, useEffect, useRef, useCallback } from "react";
import { colors } from "../theme";

interface PdfNavBarProps {
  /** 0-based page index */
  currentPage: number;
  totalPages: number;
  /** 0-based page index */
  onGoToPage: (index: number) => void;
}

// Reader-panel specific darker shades (theme border/card too subtle on black overlay).
const READER_BORDER = "#333";
const READER_BG_INPUT = "#1a1a1a";
const READER_BAR_BG = "rgba(37, 37, 37, 0.95)";

const TRACK_HEIGHT = 4;
const TRACK_HIT_AREA = 14;  // vertical padding around track for easier tap
const THUMB_SIZE = 24;
const BAR_PADDING_X = 16;
const BAR_PADDING_Y = 14;

export default function PdfNavBar({ currentPage, totalPages, onGoToPage }: PdfNavBarProps) {
  // All hooks must be called before any early returns.
  const [inputValue, setInputValue] = useState(String(currentPage + 1));
  const [isFocused, setIsFocused] = useState(false);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  const skipCommitRef = useRef(false);

  // Sync input with currentPage when not focused
  useEffect(() => {
    if (!isFocused) setInputValue(String(currentPage + 1));
  }, [currentPage, isFocused]);

  // Clear dragPage only once currentPage catches up (after relocate from foliate).
  // Otherwise the thumb would snap back to the old position between pointerup
  // and the async relocate event.
  useEffect(() => {
    if (dragPage !== null && currentPage === dragPage) {
      setDragPage(null);
    }
  }, [currentPage, dragPage]);

  // Cleanup if component unmounts mid-drag (toolbar hiding during drag etc).
  useEffect(() => () => { draggingRef.current = false; }, []);

  const pageFromEvent = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const f = rect.width > 0 ? x / rect.width : 0;
    const idx = Math.round(f * (totalPages - 1));
    return Math.max(0, Math.min(totalPages - 1, idx));
  }, [totalPages]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const page = pageFromEvent(e.clientX);
    setDragPage(page);
    // Don't clobber the input while user is typing.
    if (!isFocusedRef.current) setInputValue(String(page + 1));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const page = pageFromEvent(e.clientX);
    setDragPage(page);
    if (!isFocusedRef.current) setInputValue(String(page + 1));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {
      // releasePointerCapture can throw if pointer was already released
    }
    const page = pageFromEvent(e.clientX);
    setDragPage(page);  // keep until currentPage catches up (useEffect will clear)
    onGoToPage(page);
  };

  const commitInput = () => {
    const n = parseInt(inputValue, 10);
    if (!Number.isFinite(n)) {
      setInputValue(String(currentPage + 1));
      return;
    }
    const clamped = Math.max(1, Math.min(totalPages, n));
    setInputValue(String(clamped));
    if (clamped - 1 !== currentPage) onGoToPage(clamped - 1);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      skipCommitRef.current = true;
      setInputValue(String(currentPage + 1));
      e.currentTarget.blur();
    }
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const last = totalPages - 1;
    const jump = Math.max(1, Math.round(totalPages / 20));
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown": next = Math.max(0, displayPage - 1); break;
      case "ArrowRight":
      case "ArrowUp": next = Math.min(last, displayPage + 1); break;
      case "Home": next = 0; break;
      case "End": next = last; break;
      case "PageUp": next = Math.max(0, displayPage - jump); break;
      case "PageDown": next = Math.min(last, displayPage + jump); break;
    }
    if (next !== null && next !== currentPage) {
      e.preventDefault();
      onGoToPage(next);
    }
  };

  // Don't render if nothing to navigate
  if (totalPages <= 1) return null;

  // Clamp displayPage — totalPages may change mid-drag.
  const rawDisplayPage = dragPage !== null ? dragPage : currentPage;
  const displayPage = Math.max(0, Math.min(totalPages - 1, rawDisplayPage));
  const fraction = displayPage / (totalPages - 1);
  const fillPercent = fraction * 100;

  const inputWidth = totalPages >= 10000 ? 70 : totalPages >= 1000 ? 60 : 52;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: `${BAR_PADDING_Y}px ${BAR_PADDING_X}px calc(${BAR_PADDING_Y}px + env(safe-area-inset-bottom)) ${BAR_PADDING_X}px`,
        background: READER_BAR_BG,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        touchAction: "none",
        overscrollBehavior: "contain",
        borderTop: `1px solid ${READER_BORDER}`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        style={{
          fontSize: 14,
          color: colors.text,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          value={inputValue}
          aria-label={`Номер страницы, 1–${totalPages}`}
          onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ""))}
          onFocus={(e) => { setIsFocused(true); e.target.select(); }}
          onBlur={() => {
            setIsFocused(false);
            if (skipCommitRef.current) {
              skipCommitRef.current = false;
              return;
            }
            commitInput();
          }}
          onKeyDown={handleInputKeyDown}
          style={{
            width: inputWidth,
            background: READER_BG_INPUT,
            border: `1px solid ${READER_BORDER}`,
            color: colors.text,
            padding: "6px 8px",
            borderRadius: 4,
            fontFamily: "inherit",
            fontSize: 14,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            outline: "none",
          }}
        />
        <span style={{ color: colors.textDim }}>/ {totalPages}</span>
      </span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Прокрутка страниц"
        aria-valuemin={1}
        aria-valuemax={totalPages}
        aria-valuenow={displayPage + 1}
        aria-valuetext={`Страница ${displayPage + 1} из ${totalPages}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleSliderKeyDown}
        style={{
          flex: 1,
          position: "relative",
          height: TRACK_HEIGHT,
          paddingBlock: `${TRACK_HIT_AREA}px`,
          marginBlock: `-${TRACK_HIT_AREA}px`,
          cursor: "ew-resize",
          touchAction: "none",
          outline: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            right: 0,
            height: TRACK_HEIGHT,
            background: READER_BORDER,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: `${fillPercent}%`,
            height: TRACK_HEIGHT,
            background: colors.accent,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${fillPercent}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            background: colors.accent,
            borderRadius: "50%",
            boxShadow: `0 0 0 4px ${colors.accentGlow}`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
