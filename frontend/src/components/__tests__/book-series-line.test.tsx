import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BookSeriesLine from "../book-series-line";

const tokens = {
  fontSize: 14,
  color: "#aaa",
  accentName: true,
  separator: " — ",
  marginBottom: 16,
};

describe("BookSeriesLine", () => {
  it("renders series name and unified book-number suffix", () => {
    render(<BookSeriesLine seriesName="Гарри Поттер" seriesNumber={5} tokens={tokens} />);

    expect(screen.getByText("Гарри Поттер")).toHaveAttribute("data-series-name", "true");
    expect(screen.getByText(/книга 5/)).toBeInTheDocument();
  });

  it("omits the suffix when series number is absent", () => {
    render(<BookSeriesLine seriesName="Гарри Поттер" seriesNumber={null} tokens={tokens} />);

    expect(screen.queryByText(/книга/)).toBeNull();
  });
});
