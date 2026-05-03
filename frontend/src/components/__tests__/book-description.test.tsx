import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BookDescription from "../book-description";

const tokens = {
  fontSize: 13,
  lineHeight: 1.6,
  color: "rgb(200, 200, 200)",
  marginBottom: 16,
};

describe("BookDescription", () => {
  it("sanitizes and renders allowed HTML", () => {
    render(<BookDescription html="<p>Описание <strong>книги</strong></p>" tokens={tokens} />);

    expect(screen.getByText(/Описание/)).toBeInTheDocument();
    expect(screen.getByText("книги")).toBeInTheDocument();
  });

  it("removes unsafe script content", () => {
    const { container } = render(
      <BookDescription html="<p>Safe</p><script>alert('x')</script>" tokens={tokens} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container).not.toHaveTextContent("alert");
  });

  it("adds vertical scrolling when maxHeight is provided", () => {
    const { container } = render(
      <BookDescription html="<p>Long</p>" tokens={{ ...tokens, maxHeight: 390 }} />,
    );

    expect(container.firstElementChild).toHaveStyle({ overflowY: "auto", maxHeight: "390px" });
  });
});
