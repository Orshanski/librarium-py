// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CardTitleMeta from "../card-title-meta";

describe("CardTitleMeta", () => {
  const tokens = {
    titleSize: 13,
    titleLineHeight: 1.3,
    authorsSize: 12,
    seriesSize: 11,
    seriesEllipsis: false,
  };

  it("renders title + authors joined by comma", () => {
    const { container } = render(
      <CardTitleMeta title="Война и мир" authors={["Толстой Л.Н.", "Шкловский В."]} tokens={tokens} />,
    );
    expect(container.textContent).toContain("Война и мир");
    expect(container.textContent).toContain("Толстой Л.Н., Шкловский В.");
  });

  it("series undefined → series block not rendered", () => {
    const { container } = render(
      <CardTitleMeta title="X" authors={["Y"]} tokens={tokens} />,
    );
    expect(container.textContent).toBe("XY");
  });

  it("series + seriesNumber → renders 'Series (N)'", () => {
    const { container } = render(
      <CardTitleMeta title="X" authors={["Y"]} series="Серия" seriesNumber={3} tokens={tokens} />,
    );
    expect(container.textContent).toContain("Серия (3)");
  });
});
