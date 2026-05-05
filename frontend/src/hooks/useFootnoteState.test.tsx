// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFootnoteState } from "./useFootnoteState";

describe("useFootnoteState", () => {
  it("starts with closed popup, left side, and zeroed click coordinates", () => {
    const { result } = renderHook(() => useFootnoteState());
    expect(result.current.html).toBeNull();
    expect(result.current.side).toBe("left");
    expect(result.current.isOpenRef.current).toBe(false);
    expect(result.current.lastClickXRef.current).toBe(0);
    expect(result.current.lastClickYRef.current).toBe(0);
  });

  it("opens the popup when handler callbacks set html, side, and open flag", () => {
    const { result } = renderHook(() => useFootnoteState());
    act(() => {
      result.current.handlerCallbacks.setFootnoteSide("right");
      result.current.handlerCallbacks.setFootnoteHtml("<p>note</p>");
      result.current.handlerCallbacks.setFootnoteOpen(true);
    });
    expect(result.current.html).toBe("<p>note</p>");
    expect(result.current.side).toBe("right");
    expect(result.current.isOpenRef.current).toBe(true);
  });

  it("dismiss() clears html and isOpenRef but leaves side untouched", () => {
    const { result } = renderHook(() => useFootnoteState());
    act(() => {
      result.current.handlerCallbacks.setFootnoteSide("right");
      result.current.handlerCallbacks.setFootnoteHtml("<p>note</p>");
      result.current.handlerCallbacks.setFootnoteOpen(true);
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.html).toBeNull();
    expect(result.current.isOpenRef.current).toBe(false);
    expect(result.current.side).toBe("right");
  });

  it("dismiss() is idempotent — calling on an already-closed popup is a no-op", () => {
    const { result } = renderHook(() => useFootnoteState());
    // Initial state: already closed.
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.html).toBeNull();
    expect(result.current.isOpenRef.current).toBe(false);
    // Second call still safe.
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.html).toBeNull();
    expect(result.current.isOpenRef.current).toBe(false);
  });

  it("keeps ref identities stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useFootnoteState());
    const isOpenRefBefore = result.current.isOpenRef;
    const lastClickXRefBefore = result.current.lastClickXRef;
    const lastClickYRefBefore = result.current.lastClickYRef;
    const handlerClickXRefBefore = result.current.handlerCallbacks.lastClickXRef;
    rerender();
    expect(result.current.isOpenRef).toBe(isOpenRefBefore);
    expect(result.current.lastClickXRef).toBe(lastClickXRefBefore);
    expect(result.current.lastClickYRef).toBe(lastClickYRefBefore);
    expect(result.current.handlerCallbacks.lastClickXRef).toBe(handlerClickXRefBefore);
  });

  it("exposes handlerCallbacks.lastClickXRef as the same object as lastClickXRef (single shared ref)", () => {
    const { result } = renderHook(() => useFootnoteState());
    expect(result.current.handlerCallbacks.lastClickXRef).toBe(result.current.lastClickXRef);
  });

  it("imperative writes to lastClickXRef are observable on subsequent reads", () => {
    const { result } = renderHook(() => useFootnoteState());
    // No act() needed — ref writes don't trigger React work.
    result.current.lastClickXRef.current = 42;
    expect(result.current.lastClickXRef.current).toBe(42);
    expect(result.current.handlerCallbacks.lastClickXRef.current).toBe(42);
  });
});
