// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import { render } from "@testing-library/react";
import { useEbookReaderInstance, type EbookReaderInstanceConfig } from "./useEbookReaderInstance";
import { useFootnoteState } from "./useFootnoteState";
import { useReaderFooter } from "./useReaderFooter";
import type { ReaderSettings } from "../types/reader-settings";
import type { ReaderViewElement } from "../types/reader-foliate";
import type { ReaderNavigationRequest, ReaderRelocateDetail } from "../types/reader-handle";
import { DEFAULT_DESKTOP_TAP_ZONES } from "../constants/reader-defaults";
import "../vendor/foliate-js/view.js";

function makeSettings(): ReaderSettings {
  return {
    fontSize: 16,
    lineSpacing: 1.5,
    fontFamily: "serif",
    flow: "paginated",
    theme: "dark",
    hyphenate: false,
    justify: false,
    desktopTapZones: DEFAULT_DESKTOP_TAP_ZONES,
    pdfTapZones: DEFAULT_DESKTOP_TAP_ZONES,
  };
}

function makeConfig(): EbookReaderInstanceConfig {
  return {
    maxInlineSize: "1000px",
    gap: "5%",
    margin: undefined,
    maxBlockSize: undefined,
    showFooter: true,
    isMobile: false,
  };
}

/**
 * Test host that builds all 11 hook params via real React refs and child hooks
 * (useFootnoteState, useReaderFooter), then mounts the foliate-view into its own
 * container <div>. Mirrors the production wiring in ebook-reader.tsx.
 *
 * `viewRef` is accepted from the outside so tests can inspect `viewRef.current`
 * directly after render/unmount.
 */
function TestHost({ blob, viewRef }: {
  blob: Blob;
  viewRef: MutableRefObject<ReaderViewElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const performNavigationRef = useRef<(request: ReaderNavigationRequest) => Promise<void>>(async () => {});
  const callbacksRef = useRef<{
    onRelocate?: (detail: ReaderRelocateDetail) => void;
    onReady?: () => void;
    onSavePosition?: (cfi: string, fraction: number) => void;
  } | undefined>(undefined);
  const onCenterTapRef = useRef<(() => void) | undefined>(undefined);
  const settingsRef = useRef<ReaderSettings>(makeSettings());
  const configRef = useRef<EbookReaderInstanceConfig>(makeConfig());
  const footnote = useFootnoteState();
  const footer = useReaderFooter(containerRef, settingsRef, configRef);

  useEbookReaderInstance({
    bookBlob: blob,
    initialPosition: null,
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

  return <div ref={containerRef} data-testid="container" />;
}

/**
 * Variant whose containerRef is a manually-constructed ref object with .current = null.
 * Forces the defensive short-circuit branch (`if (!container || !bookBlob) return;`)
 * without otherwise differing from TestHost.
 */
function TestHostNullContainer({ blob, containerRef, viewRef }: {
  blob: Blob;
  containerRef: RefObject<HTMLDivElement | null>;
  viewRef: MutableRefObject<ReaderViewElement | null>;
}) {
  const performNavigationRef = useRef<(request: ReaderNavigationRequest) => Promise<void>>(async () => {});
  const callbacksRef = useRef<{
    onRelocate?: (detail: ReaderRelocateDetail) => void;
    onReady?: () => void;
    onSavePosition?: (cfi: string, fraction: number) => void;
  } | undefined>(undefined);
  const onCenterTapRef = useRef<(() => void) | undefined>(undefined);
  const settingsRef = useRef<ReaderSettings>(makeSettings());
  const configRef = useRef<EbookReaderInstanceConfig>(makeConfig());
  const footnote = useFootnoteState();
  const internalFooterContainer = useRef<HTMLDivElement>(null);
  const footer = useReaderFooter(internalFooterContainer, settingsRef, configRef);

  useEbookReaderInstance({
    bookBlob: blob,
    initialPosition: null,
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

  return null;
}

describe("useEbookReaderInstance", () => {
  it("mounts foliate-view into containerRef on render and removes it on unmount", () => {
    const blob = new Blob([""], { type: "application/epub+zip" });
    const viewRef: MutableRefObject<ReaderViewElement | null> = { current: null };
    const { container, unmount } = render(<TestHost blob={blob} viewRef={viewRef} />);

    expect(container.querySelector("foliate-view")).not.toBeNull();
    expect(viewRef.current).not.toBeNull();

    unmount();

    expect(container.querySelector("foliate-view")).toBeNull();
    expect(viewRef.current).toBeNull();
  });

  it("attaches resize and pagehide listeners on mount and removes them on unmount", () => {
    const add = vi.spyOn(globalThis, "addEventListener");
    const remove = vi.spyOn(globalThis, "removeEventListener");
    const blob = new Blob([""], { type: "application/epub+zip" });
    const viewRef: MutableRefObject<ReaderViewElement | null> = { current: null };

    const { unmount } = render(<TestHost blob={blob} viewRef={viewRef} />);

    const addedResize = add.mock.calls.filter(([t]) => t === "resize").length;
    const addedPagehide = add.mock.calls.filter(([t]) => t === "pagehide").length;
    expect(addedResize).toBeGreaterThanOrEqual(1);
    expect(addedPagehide).toBeGreaterThanOrEqual(1);

    unmount();

    const removedResize = remove.mock.calls.filter(([t]) => t === "resize").length;
    const removedPagehide = remove.mock.calls.filter(([t]) => t === "pagehide").length;
    expect(removedResize).toBeGreaterThanOrEqual(addedResize);
    expect(removedPagehide).toBeGreaterThanOrEqual(addedPagehide);

    add.mockRestore();
    remove.mockRestore();
  });

  it("defensively short-circuits when containerRef.current is null", () => {
    const nullContainerRef: MutableRefObject<HTMLDivElement | null> = { current: null };
    const viewRef: MutableRefObject<ReaderViewElement | null> = { current: null };
    const blob = new Blob([""], { type: "application/epub+zip" });
    const { container } = render(
      <TestHostNullContainer blob={blob} containerRef={nullContainerRef} viewRef={viewRef} />,
    );

    // No foliate-view appended anywhere; viewRef stays null.
    expect(container.querySelector("foliate-view")).toBeNull();
    expect(viewRef.current).toBeNull();
  });

});
