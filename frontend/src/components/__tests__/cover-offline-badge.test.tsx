// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CoverOfflineBadge from "../cover-offline-badge";

describe("CoverOfflineBadge", () => {
  it("renders inner CloudBadge svg with hasOffline=true", () => {
    const { container } = render(
      <CoverOfflineBadge tokens={{ outerSize: 28, innerSize: 16, bottom: 6, right: 6 }} />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("tokens applied — outer div size and position", () => {
    const { container } = render(
      <CoverOfflineBadge tokens={{ outerSize: 24, innerSize: 14, bottom: 4, right: 4 }} />,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.width).toBe("24px");
    expect(outer.style.height).toBe("24px");
    expect(outer.style.bottom).toBe("4px");
    expect(outer.style.right).toBe("4px");
    expect(outer.style.borderRadius).toBe("50%");
  });
});
