import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BookMetaPill from "../book-meta-pill";

const tokens = {
  padding: "5px 12px",
  fontSize: 12,
  borderRadius: 14,
  background: "rgba(255, 255, 255, 0.06)",
  border: "1px solid #333",
  color: "#eee",
};

describe("BookMetaPill", () => {
  it("renders non-interactive text", () => {
    render(<BookMetaPill text="фэнтези" tokens={tokens} />);

    expect(screen.getByText("фэнтези")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("applies tokenized visual style", () => {
    render(<BookMetaPill text="фэнтези" tokens={tokens} />);

    expect(screen.getByText("фэнтези")).toHaveStyle({ borderRadius: "14px" });
  });
});
