import { useState, useEffect, useRef, useCallback } from "react";

interface PdfNavBarProps {
  currentPage: number;  // 0-based
  totalPages: number;
  onGoToPage: (index: number) => void;  // 0-based
}

const ACCENT = "#4a9eff";
const BORDER = "#333";
const TEXT = "#e0e0e0";
const TEXT_DIM = "#888";
const BG_INPUT = "#1a1a1a";

export default function PdfNavBar({ currentPage, totalPages, onGoToPage }: PdfNavBarProps) {
  // All hooks must be called before any early returns.
  const [inputValue, setInputValue] = useState(String(currentPage + 1));
  const [isFocused, setIsFocused] = useState(false);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

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

  const displayPage = dragPage !== null ? dragPage : currentPage;
  const fraction = totalPages > 1 ? displayPage / (totalPages - 1) : 0;
  const fillPercent = fraction * 100;

  const pageFromEvent = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return currentPage;
    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const f = rect.width > 0 ? x / rect.width : 0;
    const idx = Math.round(f * (totalPages - 1));
    return Math.max(0, Math.min(totalPages - 1, idx));
  }, [currentPage, totalPages]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const page = pageFromEvent(e.clientX);
    setDragPage(page);
    setInputValue(String(page + 1));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const page = pageFromEvent(e.clientX);
    setDragPage(page);
    setInputValue(String(page + 1));
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setInputValue(String(currentPage + 1));
      e.currentTarget.blur();
    }
  };

  // Don't render if nothing to navigate
  if (totalPages <= 1) return null;

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
        padding: "14px 16px calc(14px + env(safe-area-inset-bottom)) 16px",
        background: "rgba(37, 37, 37, 0.95)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        touchAction: "none",
        overscrollBehavior: "contain",
        borderTop: `1px solid ${BORDER}`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        style={{
          fontSize: 14,
          color: TEXT,
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
          onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ""))}
          onFocus={(e) => { setIsFocused(true); e.target.select(); }}
          onBlur={() => { setIsFocused(false); commitInput(); }}
          onKeyDown={handleKeyDown}
          style={{
            width: 52,
            background: BG_INPUT,
            border: `1px solid ${BORDER}`,
            color: TEXT,
            padding: "6px 8px",
            borderRadius: 4,
            fontFamily: "inherit",
            fontSize: 14,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            outline: "none",
          }}
        />
        <span style={{ color: TEXT_DIM }}>/ {totalPages}</span>
      </span>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          flex: 1,
          position: "relative",
          height: 4,
          padding: "14px 0",
          margin: "-14px 0",
          cursor: "pointer",
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            right: 0,
            height: 4,
            background: BORDER,
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
            height: 4,
            background: ACCENT,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${fillPercent}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 24,
            height: 24,
            background: ACCENT,
            borderRadius: "50%",
            boxShadow: "0 0 0 4px rgba(74, 158, 255, 0.2)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
