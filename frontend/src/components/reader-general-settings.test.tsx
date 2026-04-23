// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ReaderGeneralSettings from "./reader-general-settings";
import type { ReaderSettings } from "../types/reader-settings";

const baseSettings: ReaderSettings = {
  fontSize: 16,
  lineSpacing: 1.5,
  fontFamily: "serif",
  flow: "paginated",
  theme: "dark",
  hyphenate: false,
  justify: false,
  desktopTapZones: {
    topLeft: "prev",
    bottomLeft: "prev",
    topCenter: "next",
    bottomCenter: "next",
    topRight: "next",
    bottomRight: "next",
  },
  pdfTapZones: {
    topLeft: "prev",
    bottomLeft: "prev",
    topCenter: "next",
    bottomCenter: "next",
    topRight: "next",
    bottomRight: "next",
  },
};

describe("ReaderGeneralSettings", () => {
  it("theme click → onChange with new theme", () => {
    const onChange = vi.fn();
    render(<ReaderGeneralSettings settings={baseSettings} onChange={onChange} />);
    fireEvent.click(screen.getByText("Тёплая"));
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings, theme: "warm" });
  });

  it("flow mode click → onChange with new flow", () => {
    const onChange = vi.fn();
    render(<ReaderGeneralSettings settings={baseSettings} onChange={onChange} />);
    fireEvent.click(screen.getByText("Скролл"));
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings, flow: "scrolled" });
  });

  it("hyphenate toggle → onChange with inverted flag", () => {
    const onChange = vi.fn();
    render(<ReaderGeneralSettings settings={baseSettings} onChange={onChange} />);
    fireEvent.click(screen.getByText("Переносы"));
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings, hyphenate: true });
  });

  it("justify toggle → onChange with inverted flag", () => {
    const onChange = vi.fn();
    render(<ReaderGeneralSettings settings={baseSettings} onChange={onChange} />);
    fireEvent.click(screen.getByText("По ширине"));
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings, justify: true });
  });

  it("font size range → debounced onChange after 150ms", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ReaderGeneralSettings settings={baseSettings} onChange={onChange} />);

    const ranges = screen.getAllByRole("slider");
    // First slider is fontSize
    fireEvent.change(ranges[0], { target: { value: "20" } });

    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings, fontSize: 20 });
    vi.useRealTimers();
  });

  it("line spacing range → debounced onChange after 150ms", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ReaderGeneralSettings settings={baseSettings} onChange={onChange} />);

    const ranges = screen.getAllByRole("slider");
    // Second slider is lineSpacing
    fireEvent.change(ranges[1], { target: { value: "2" } });

    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings, lineSpacing: 2 });
    vi.useRealTimers();
  });
});
