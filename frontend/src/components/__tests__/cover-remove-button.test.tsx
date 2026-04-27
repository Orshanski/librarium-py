// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import CoverRemoveButton from "../cover-remove-button";

describe("CoverRemoveButton", () => {
  const baseTokens = { size: 22, top: 4, left: 4, fontSize: 12 };

  it("calls onClick with preventDefault and stopPropagation", () => {
    const onClick = vi.fn();
    const onBodyClick = vi.fn();
    document.body.addEventListener("click", onBodyClick);
    try {
      const { container } = render(
        <CoverRemoveButton onClick={onClick} tokens={{ ...baseTokens, withHoverFade: true }} />,
      );
      const btn = container.querySelector("button")!;
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      btn.dispatchEvent(event);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onBodyClick).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    } finally {
      document.body.removeEventListener("click", onBodyClick);
    }
  });

  it("withHoverFade=true → starting opacity 0.7; withHoverFade=false → opacity 1", () => {
    const { container: c1 } = render(
      <CoverRemoveButton onClick={() => {}} tokens={{ ...baseTokens, withHoverFade: true }} />,
    );
    expect((c1.querySelector("button") as HTMLElement).style.opacity).toBe("0.7");

    const { container: c2 } = render(
      <CoverRemoveButton
        onClick={() => {}}
        tokens={{ size: 44, top: 0, left: 0, fontSize: 14, withHoverFade: false }}
      />,
    );
    expect((c2.querySelector("button") as HTMLElement).style.opacity).toBe("1");
  });
});
