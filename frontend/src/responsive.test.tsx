// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ResponsiveProvider, useIsMobile } from "./responsive";

function Probe() {
  useIsMobile();
  return null;
}

describe("useIsMobile", () => {
  it("throws when used outside ResponsiveProvider", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ResponsiveProvider/);
    errorSpy.mockRestore();
  });

  it("does not throw inside ResponsiveProvider", () => {
    expect(() =>
      render(
        <ResponsiveProvider>
          <Probe />
        </ResponsiveProvider>,
      ),
    ).not.toThrow();
  });
});
