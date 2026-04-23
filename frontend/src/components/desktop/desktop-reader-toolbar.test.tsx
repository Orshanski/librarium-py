// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DesktopReaderToolbar from "./desktop-reader-toolbar";
import type { ReaderSettings } from "../../types/reader-settings";
import { DEFAULT_DESKTOP_TAP_ZONES } from "../../constants/reader-defaults";

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

describe("DesktopReaderToolbar", () => {
  it("renders book title", () => {
    render(
      <DesktopReaderToolbar
        bookTitle="Война и мир"
        fraction={0}
        tocItems={[]}
        currentTocHref=""
        settings={makeSettings()}
        onSettingsChange={vi.fn()}
        onTocSelect={vi.fn()}
        onClose={vi.fn()}
        maxTocDepth={3}
        tapZonesKey="desktopTapZones"
      />,
    );
    expect(screen.getByText("Война и мир")).toBeInTheDocument();
  });

  it("click on title opens TOC dropdown with items", () => {
    const tocItems = [
      { label: "Глава 1", href: "ch1" },
      { label: "Глава 2", href: "ch2" },
    ];
    render(
      <DesktopReaderToolbar
        bookTitle="Book"
        fraction={0}
        tocItems={tocItems}
        currentTocHref="ch1"
        settings={makeSettings()}
        onSettingsChange={vi.fn()}
        onTocSelect={vi.fn()}
        onClose={vi.fn()}
        maxTocDepth={3}
        tapZonesKey="desktopTapZones"
      />,
    );
    fireEvent.click(screen.getByText("Book"));
    expect(screen.getByText("Глава 1")).toBeInTheDocument();
    expect(screen.getByText("Глава 2")).toBeInTheDocument();
  });

  it("TOC item click calls onTocSelect and closes TOC", () => {
    const onTocSelect = vi.fn();
    render(
      <DesktopReaderToolbar
        bookTitle="Book"
        fraction={0}
        tocItems={[{ label: "Ch1", href: "ch1" }]}
        currentTocHref=""
        settings={makeSettings()}
        onSettingsChange={vi.fn()}
        onTocSelect={onTocSelect}
        onClose={vi.fn()}
        maxTocDepth={3}
        tapZonesKey="desktopTapZones"
      />,
    );
    fireEvent.click(screen.getByText("Book"));
    fireEvent.click(screen.getByText("Ch1"));
    expect(onTocSelect).toHaveBeenCalledWith("ch1");
  });

  it("shows empty TOC message when tocItems is empty", () => {
    render(
      <DesktopReaderToolbar
        bookTitle="Book"
        fraction={0}
        tocItems={[]}
        currentTocHref=""
        settings={makeSettings()}
        onSettingsChange={vi.fn()}
        onTocSelect={vi.fn()}
        onClose={vi.fn()}
        maxTocDepth={3}
        tapZonesKey="desktopTapZones"
      />,
    );
    fireEvent.click(screen.getByText("Book"));
    expect(screen.getByText("Нет содержания")).toBeInTheDocument();
  });
});
